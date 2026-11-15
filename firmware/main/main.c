#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

#include "driver/gpio.h"
#include "esp_crt_bundle.h"
#include "esp_err.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_sntp.h"
#include "esp_websocket_client.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "nvs.h"
#include "nvs_flash.h"
#include "secrets.h"

#define WIFI_CONNECTED_BIT BIT0
#define BOOT_TASK_STACK_BYTES 16384
#define RELAY_HOLD_MS 5000
#define HEARTBEAT_INTERVAL_MS 30000
#define COMMAND_SIZE 96

static const char *TAG = "remote_boot";
static EventGroupHandle_t wifi_events;
static QueueHandle_t command_queue;

typedef struct {
    char id[37];
    bool hold;
    int64_t expires_at;
} relay_command_t;

static void wifi_event_handler(void *arg, esp_event_base_t base, int32_t id, void *data) {
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        const wifi_event_sta_disconnected_t *event = data;
        ESP_LOGW(TAG, "Wi-Fi disconnected (reason %d); retrying", event ? event->reason : -1);
        xEventGroupClearBits(wifi_events, WIFI_CONNECTED_BIT);
        esp_wifi_connect();
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        ESP_LOGI(TAG, "Wi-Fi connected; IP address obtained");
        xEventGroupSetBits(wifi_events, WIFI_CONNECTED_BIT);
    }
}

static void connect_wifi(void) {
    wifi_events = xEventGroupCreate();
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();
    wifi_init_config_t config = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&config));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, wifi_event_handler, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, wifi_event_handler, NULL));
    wifi_config_t wifi_config = {0};
    snprintf((char *)wifi_config.sta.ssid, sizeof(wifi_config.sta.ssid), "%s", WIFI_SSID);
    snprintf((char *)wifi_config.sta.password, sizeof(wifi_config.sta.password), "%s", WIFI_PASSWORD);
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());
}

static void wait_for_clock(void) {
    sntp_setoperatingmode(SNTP_OPMODE_POLL);
    sntp_setservername(0, "pool.ntp.org");
    sntp_init();
    while (time(NULL) < 1700000000) {
        ESP_LOGI(TAG, "Waiting for clock sync before WebSocket connection");
        vTaskDelay(pdMS_TO_TICKS(2000));
    }
}

static bool valid_id(const char *id) {
    if (strlen(id) != 36) return false;
    for (int i = 0; i < 36; ++i) {
        if (i == 8 || i == 13 || i == 18 || i == 23) {
            if (id[i] != '-') return false;
        } else if (!((id[i] >= '0' && id[i] <= '9') || (id[i] >= 'a' && id[i] <= 'f'))) return false;
    }
    return true;
}

static void websocket_event(void *arg, esp_event_base_t base, int32_t event_id, void *event_data) {
    esp_websocket_event_data_t *event = event_data;
    if (event_id == WEBSOCKET_EVENT_CONNECTED) {
        ESP_LOGI(TAG, "Device WebSocket connected; website should show ESP32 online");
    } else if (event_id == WEBSOCKET_EVENT_DISCONNECTED) {
        ESP_LOGW(TAG, "Device WebSocket disconnected; reconnecting");
    } else if (event_id == WEBSOCKET_EVENT_ERROR) {
        if (event) {
            ESP_LOGW(TAG, "Device WebSocket error: TLS=%s verify=0x%x handshake HTTP=%d",
                     esp_err_to_name(event->error_handle.esp_tls_last_esp_err),
                     event->error_handle.esp_tls_cert_verify_flags,
                     event->error_handle.esp_ws_handshake_status_code);
        } else {
            ESP_LOGW(TAG, "Device WebSocket error");
        }
    } else if (event_id == WEBSOCKET_EVENT_DATA && event && event->data_ptr) {
        if (event->op_code != 0x1 || !event->fin || event->payload_offset != 0 ||
            event->data_len != event->payload_len || event->data_len < 0 || event->data_len >= COMMAND_SIZE) return;
        char message[COMMAND_SIZE];
        memcpy(message, event->data_ptr, event->data_len);
        message[event->data_len] = '\0';
        if (strncmp(message, "ACKED ", 6) == 0) {
            ESP_LOGI(TAG, "Command acknowledged by device Worker");
            return;
        }
        relay_command_t command = {0};
        long long expiry = 0;
        char extra;
        char action[6];
        if (sscanf(message, "%5s %36s %lld %c", action, command.id, &expiry, &extra) != 3) return;
        if (strcmp(action, "BOOT") != 0 && strcmp(action, "HOLD") != 0) return;
        if (!valid_id(command.id) || expiry <= 0) return;
        command.hold = strcmp(action, "HOLD") == 0;
        command.expires_at = expiry;
        if (xQueueSend(command_queue, &command, 0) != pdTRUE) ESP_LOGW(TAG, "Command queue full");
    }
}

static bool already_processed(const char *id) {
    nvs_handle_t handle;
    if (nvs_open("boot", NVS_READONLY, &handle) != ESP_OK) return false;
    char last_id[37] = {0};
    size_t size = sizeof(last_id);
    esp_err_t error = nvs_get_str(handle, "last_id", last_id, &size);
    nvs_close(handle);
    return error == ESP_OK && strcmp(last_id, id) == 0;
}

static bool save_processed_id(const char *id) {
    nvs_handle_t handle;
    if (nvs_open("boot", NVS_READWRITE, &handle) != ESP_OK) return false;
    esp_err_t error = nvs_set_str(handle, "last_id", id);
    if (error == ESP_OK) error = nvs_commit(handle);
    nvs_close(handle);
    return error == ESP_OK;
}

static void activate_relay(bool hold) {
    gpio_set_level(RELAY_GPIO, RELAY_ACTIVE_LEVEL);
    vTaskDelay(pdMS_TO_TICKS(hold ? RELAY_HOLD_MS : RELAY_PULSE_MS));
    gpio_set_level(RELAY_GPIO, !RELAY_ACTIVE_LEVEL);
}

static void setup_relay(void) {
    gpio_set_level(RELAY_GPIO, !RELAY_ACTIVE_LEVEL);
    gpio_config_t config = {
        .pin_bit_mask = 1ULL << RELAY_GPIO,
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = RELAY_ACTIVE_LEVEL == 0 ? GPIO_PULLUP_ENABLE : GPIO_PULLUP_DISABLE,
        .pull_down_en = RELAY_ACTIVE_LEVEL == 1 ? GPIO_PULLDOWN_ENABLE : GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    ESP_ERROR_CHECK(gpio_config(&config));
    gpio_set_level(RELAY_GPIO, !RELAY_ACTIVE_LEVEL);
}

#if defined(ALLOW_INSECURE_LOCAL_WS) && ALLOW_INSECURE_LOCAL_WS
static bool is_private_lan_url(const char *url) {
    unsigned int a, b, c, d, port;
    int length = 0;
    if (sscanf(url, "http://%u.%u.%u.%u:%u%n", &a, &b, &c, &d, &port, &length) != 5 ||
        length == 0 || (url[length] != '\0' && url[length] != '/') ||
        a > 255 || b > 255 || c > 255 || d > 255 || port == 0 || port > 65535) return false;
    return a == 10 || (a == 172 && b >= 16 && b <= 31) || (a == 192 && b == 168);
}
#endif

static void boot_task(void *arg) {
    bool secure = strncmp(DEVICE_URL, "https://", 8) == 0;
#if !defined(ALLOW_INSECURE_LOCAL_WS) || !ALLOW_INSECURE_LOCAL_WS
    if (!secure) {
        ESP_LOGE(TAG, "DEVICE_URL must use HTTPS (or explicitly enable LAN test mode)");
        vTaskDelete(NULL);
        return;
    }
#else
    if (!secure && !is_private_lan_url(DEVICE_URL)) {
        ESP_LOGE(TAG, "Plain HTTP is allowed only for a private LAN IPv4 address and port");
        vTaskDelete(NULL);
        return;
    }
#endif
    if (DEVICE_URL[strlen(DEVICE_URL) - 1] == '/') {
        ESP_LOGE(TAG, "DEVICE_URL must not have a trailing slash");
        vTaskDelete(NULL);
        return;
    }
    ESP_ERROR_CHECK(nvs_flash_init());
    setup_relay();
    connect_wifi();
    while (!(xEventGroupWaitBits(wifi_events, WIFI_CONNECTED_BIT, pdFALSE, pdFALSE, portMAX_DELAY) & WIFI_CONNECTED_BIT)) {}
    wait_for_clock();
    char ws_url[256];
    int url_length = snprintf(ws_url, sizeof(ws_url), "%s://%s/connect",
                              secure ? "wss" : "ws", DEVICE_URL + (secure ? 8 : 7));
    if (url_length < 0 || (size_t)url_length >= sizeof(ws_url)) {
        ESP_LOGE(TAG, "Device URL is too long");
        vTaskDelete(NULL);
        return;
    }
    esp_websocket_client_config_t config = {
        .uri = ws_url,
        .crt_bundle_attach = secure ? esp_crt_bundle_attach : NULL,
        .reconnect_timeout_ms = 5000,
        .enable_close_reconnect = true,
        .ping_interval_sec = 20,
    };
    if (!secure) ESP_LOGW(TAG, "LAN test mode: WebSocket traffic is unencrypted");
    ESP_LOGI(TAG, "Connecting to %s", ws_url);
    esp_websocket_client_handle_t client = esp_websocket_client_init(&config);
    if (!client) {
        ESP_LOGE(TAG, "Could not initialize WebSocket client");
        vTaskDelete(NULL);
        return;
    }
    ESP_ERROR_CHECK(esp_websocket_client_append_header(client, "x-device-token", DEVICE_TOKEN));
    ESP_ERROR_CHECK(esp_websocket_register_events(client, WEBSOCKET_EVENT_ANY, websocket_event, NULL));
    ESP_ERROR_CHECK(esp_websocket_client_start(client));
    TickType_t last_heartbeat = 0;
    while (true) {
        bool connected = esp_websocket_client_is_connected(client);
        TickType_t now_ticks = xTaskGetTickCount();
        if (connected && (last_heartbeat == 0 || now_ticks - last_heartbeat >= pdMS_TO_TICKS(HEARTBEAT_INTERVAL_MS))) {
            esp_websocket_client_send_text(client, "PING", 4, pdMS_TO_TICKS(1000));
            last_heartbeat = now_ticks;
        }
        relay_command_t command;
        if (xQueueReceive(command_queue, &command, pdMS_TO_TICKS(1000)) != pdTRUE) continue;
        if (!esp_websocket_client_is_connected(client) || (int64_t)time(NULL) * 1000 >= command.expires_at) continue;
        if (!already_processed(command.id)) {
            if (!save_processed_id(command.id)) {
                ESP_LOGE(TAG, "Could not save command ID; relay activation refused");
                continue;
            }
            activate_relay(command.hold);
            ESP_LOGI(TAG, "%s", command.hold ? "Five-second power-button hold sent" : "Power-button pulse sent");
        }
        char ack[41];
        snprintf(ack, sizeof(ack), "ACK %s", command.id);
        if (esp_websocket_client_is_connected(client) && esp_websocket_client_send_text(client, ack, strlen(ack), pdMS_TO_TICKS(1000)) < 0)
            ESP_LOGW(TAG, "Acknowledgement send failed; retry on reconnect");
    }
}

void app_main(void) {
    command_queue = xQueueCreate(4, sizeof(relay_command_t));
    if (!command_queue) {
        ESP_LOGE(TAG, "Could not create command queue");
        return;
    }
    if (xTaskCreate(boot_task, "boot_control", BOOT_TASK_STACK_BYTES, NULL, 5, NULL) != pdPASS) {
        ESP_LOGE(TAG, "Could not create boot task");
    }
}
