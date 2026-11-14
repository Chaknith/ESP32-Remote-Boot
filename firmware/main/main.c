#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

#include "driver/gpio.h"
#include "esp_crt_bundle.h"
#include "esp_event.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_sntp.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/task.h"
#include "nvs.h"
#include "nvs_flash.h"
#include "secrets.h"

#define WIFI_CONNECTED_BIT BIT0
#define POLL_INTERVAL_MS 10000
#define RESPONSE_SIZE 96
#define BOOT_TASK_STACK_BYTES 16384
#define RELAY_HOLD_MS 5000

static const char *TAG = "remote_boot";
static EventGroupHandle_t wifi_events;

typedef struct {
    char text[RESPONSE_SIZE];
    size_t length;
} response_buffer_t;

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
        ESP_LOGI(TAG, "Waiting for clock sync before HTTPS");
        vTaskDelay(pdMS_TO_TICKS(2000));
    }
}

static esp_err_t http_event_handler(esp_http_client_event_t *event) {
    if (event->event_id != HTTP_EVENT_ON_DATA || !event->user_data) return ESP_OK;
    response_buffer_t *buffer = event->user_data;
    if (buffer->length + event->data_len >= RESPONSE_SIZE) return ESP_FAIL;
    memcpy(buffer->text + buffer->length, event->data, event->data_len);
    buffer->length += event->data_len;
    buffer->text[buffer->length] = '\0';
    return ESP_OK;
}

static int request(const char *path, esp_http_client_method_t method, const char *body, response_buffer_t *response) {
    char url[256];
    int length = snprintf(url, sizeof(url), "%s%s", DEVICE_URL, path);
    if (length < 0 || length >= sizeof(url)) return -1;
    memset(response, 0, sizeof(*response));
    esp_http_client_config_t config = {
        .url = url,
        .method = method,
        .timeout_ms = 8000,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .event_handler = http_event_handler,
        .user_data = response,
    };
    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (!client) return -1;
    esp_http_client_set_header(client, "x-device-token", DEVICE_TOKEN);
    if (body) {
        esp_http_client_set_header(client, "content-type", "text/plain");
        esp_http_client_set_post_field(client, body, strlen(body));
    }
    esp_err_t error = esp_http_client_perform(client);
    int status = error == ESP_OK ? esp_http_client_get_status_code(client) : -1;
    if (error != ESP_OK) ESP_LOGW(TAG, "HTTPS request failed: %s", esp_err_to_name(error));
    esp_http_client_cleanup(client);
    return status;
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

static void boot_task(void *arg) {
    if (strncmp(DEVICE_URL, "https://", 8) != 0) {
        ESP_LOGE(TAG, "DEVICE_URL must use HTTPS");
        vTaskDelete(NULL);
        return;
    }
    ESP_ERROR_CHECK(nvs_flash_init());
    setup_relay();
    connect_wifi();
    while (!(xEventGroupWaitBits(wifi_events, WIFI_CONNECTED_BIT, pdFALSE, pdFALSE, portMAX_DELAY) & WIFI_CONNECTED_BIT)) {}
    wait_for_clock();

    bool poll_reported = false;
    while (true) {
        if (xEventGroupGetBits(wifi_events) & WIFI_CONNECTED_BIT) {
            response_buffer_t response;
            int status = request("/poll", HTTP_METHOD_GET, NULL, &response);
            if (status == 200 && !poll_reported) {
                ESP_LOGI(TAG, "Device poll succeeded; website should show ESP32 online");
                ESP_LOGI(TAG, "Boot task minimum free stack: %u bytes", (unsigned)uxTaskGetStackHighWaterMark(NULL));
                poll_reported = true;
            }
            bool hold = strncmp(response.text, "HOLD ", 5) == 0;
            bool pulse = strncmp(response.text, "BOOT ", 5) == 0;
            if (status == 200 && (pulse || hold)) {
                char *id = response.text + 5;
                if (strlen(id) == 36) {
                    if (!already_processed(id)) {
                        if (save_processed_id(id)) {
                            activate_relay(hold);
                            ESP_LOGI(TAG, "%s", hold ? "Five-second power-button hold sent" : "Power-button pulse sent");
                        } else {
                            ESP_LOGE(TAG, "Could not save command ID; pulse refused");
                            vTaskDelay(pdMS_TO_TICKS(POLL_INTERVAL_MS));
                            continue;
                        }
                    }
                    response_buffer_t ack_response;
                    int ack_status = request("/ack", HTTP_METHOD_POST, id, &ack_response);
                    if (ack_status != 200) ESP_LOGW(TAG, "Acknowledgement failed: HTTP %d", ack_status);
                }
            } else if (status != 200) {
                poll_reported = false;
                ESP_LOGW(TAG, "Polling failed: HTTP %d", status);
            }
        }
        vTaskDelay(pdMS_TO_TICKS(POLL_INTERVAL_MS));
    }
}

void app_main(void) {
    if (xTaskCreate(boot_task, "boot_control", BOOT_TASK_STACK_BYTES, NULL, 5, NULL) != pdPASS) {
        ESP_LOGE(TAG, "Could not create boot task");
    }
}
