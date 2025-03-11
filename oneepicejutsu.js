// ==UserScript==
// @name         One Piece Tracker Mobile V2
// @namespace    https://github.com/n0bl3z
// @version      2.2
// @description  Мобильная версия трекера просмотра One Piece с автосохранением прогресса
// @author       Anonymous
// @match        *://jut.su/oneepiece/*
// @match        *://animevost.org/tip/tv/186-one-piece.html
// @match        *://jutsu.club/oneepiece/*
// @match        *://*.jut.su/oneepiece/*
// @match        *://animerost.org/oneepiece/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=jut.su
// @grant        none
// @run-at       document-end
// @noframes
// @updateURL    https://raw.githubusercontent.com/n0bl3z/onepiecejutsu/main/oneepicejutsu.js
// @downloadURL  https://raw.githubusercontent.com/n0bl3z/onepiecejutsu/main/oneepicejutsu.js
// ==/UserScript==

//
// Мобильная версия с оптимизацией под сенсорный ввод:
// - Сохранение прогресса
// - Синхронизация с аккаунтом сайта
// - Жесты управления видео
// - Удобные кнопки для смартфонов

(function () {
  "use strict";

  // Конфигурация
  const CONFIG = {
    DEBUG: false, // Выключаем отладку для производительности
    SYNC_WITH_ACCOUNT: true, // Синхронизация с аккаунтом сайта
    VERSION: "2.2", // Версия скрипта
    SAVE_INTERVAL: 30, // Интервал сохранения в секундах
    GITHUB_TOKEN: localStorage.getItem("onePieceGithubToken") || "",
    USE_CLOUD: true, // Включаем синхронизацию с облаком
    MOBILE_OPTIMIZED: true, // Включаем специальную оптимизацию для мобильных устройств
    TOUCH_SENSITIVITY: 1.2, // Повышенная чувствительность для сенсорных экранов
    BUTTON_CHECK_INTERVAL: 400, // Интервал проверки кнопок в мс (уменьшен для быстрого отклика)
  };

  // Определение типа устройства для оптимизации
  const DEVICE = {
    isMobile:
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      ),
    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,
    isAndroid: /Android/i.test(navigator.userAgent),
    hasTouch: "ontouchstart" in window || navigator.maxTouchPoints > 0,
    pixelRatio: window.devicePixelRatio || 1,
  };

  // Кэш для предотвращения повторного поиска элементов
  const ElementCache = {
    cache: new Map(),
    timeout: 3000, // Время в мс, через которое кэш обновляется

    get(key) {
      if (!this.cache.has(key)) return null;

      const entry = this.cache.get(key);
      const now = Date.now();

      if (now - entry.timestamp > this.timeout) {
        this.cache.delete(key);
        return null;
      }

      return entry.element;
    },

    set(key, element) {
      this.cache.set(key, {
        element: element,
        timestamp: Date.now(),
      });
    },

    clear() {
      this.cache.clear();
    },
  };

  // Переменные состояния
  let userInteractedWithVideo = false;
  let lastSaveTime = 0;
  let saveInterval = null;

  // Утилиты для работы с видео
  const Utils = {
    // Найти видеоплеер
    findVideoPlayer: function () {
      try {
        // Различные селекторы для видеоплеера
        const selectors = [
          "video#my-player_html5_api", // VideoJS (JutSu)
          "video.video-js",
          'video[src*=".mp4"]',
          "video",
          'iframe[src*="player"]',
        ];

        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element) {
            if (element.tagName === "VIDEO") {
              return element;
            } else if (element.tagName === "IFRAME") {
              try {
                return element.contentDocument.querySelector("video");
              } catch (e) {
                // Ошибка доступа к iframe - игнорируем
              }
            }
          }
        }

        return null;
      } catch (e) {
        console.error("Ошибка при поиске видеоплеера:", e);
        return null;
      }
    },

    // Принудительный клик на элементе
    // Принудительный клик на элементе - оптимизирован для мобильных устройств
    forceClick: function (element) {
      if (!element) return false;

      try {
        // 1. Проверка видимости элемента перед кликом
        const rect = element.getBoundingClientRect();
        const isVisible =
          rect.width > 0 &&
          rect.height > 0 &&
          element.offsetParent !== null &&
          window.getComputedStyle(element).display !== "none" &&
          window.getComputedStyle(element).visibility !== "hidden";

        if (!isVisible) {
          // Временно делаем элемент видимым, если он был скрыт
          const originalDisplay = element.style.display;
          const originalVisibility = element.style.visibility;

          element.style.display = "block";
          element.style.visibility = "visible";
          element.style.opacity = "1";

          // Техника №1: Простой клик
          element.click();

          // Возвращаем исходные стили
          setTimeout(() => {
            element.style.display = originalDisplay;
            element.style.visibility = originalVisibility;
          }, 100);
        } else {
          // Техника №1: Нативный клик для видимого элемента
          element.click();
        }

        // Техника №2: MouseEvents для имитации реального взаимодействия
        ["mousedown", "mouseup", "click"].forEach((eventType) => {
          const event = new MouseEvent(eventType, {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
          });
          element.dispatchEvent(event);
        });

        // Техника №3: Для мобильных устройств, эмулируем сенсорное событие
        if (DEVICE && DEVICE.hasTouch) {
          try {
            const touchStart = new Event("touchstart", { bubbles: true });
            const touchEnd = new Event("touchend", { bubbles: true });
            element.dispatchEvent(touchStart);
            element.dispatchEvent(touchEnd);
          } catch (e) {
            // Игнорируем ошибки сенсорных событий
          }
        }

        // Техника №4: Для ссылок - прямой переход
        if (element.tagName === "A" && element.href) {
          setTimeout(() => {
            window.location.href = element.href;
          }, 50);
        }

        // Отмечаем в кэше, что уже кликнули
        const skipButtonCache = sessionStorage.getItem("skipButtonCache");
        if (skipButtonCache) {
          try {
            const data = JSON.parse(skipButtonCache);
            data.clicked = true;
            sessionStorage.setItem("skipButtonCache", JSON.stringify(data));
          } catch (e) {}
        }

        return true;
      } catch (e) {
        console.error("Ошибка при клике на элемент:", e);

        // Запасной вариант - классический click
        try {
          element.click();
          return true;
        } catch (err) {
          return false;
        }
      }
    },
  };

  // Объект для работы с облачным хранилищем
  const CloudStorage = {
    // ID для Gist - может быть получен из локального хранилища
    gistId: localStorage.getItem("onePieceGistId"),

    // Сохранение данных в GitHub Gist
    async saveToGist(data) {
      if (CONFIG.DEBUG) console.log("Попытка сохранения в Gist");

      // Если нет токена - не сохраняем
      if (!CONFIG.GITHUB_TOKEN) {
        console.log("GitHub токен не найден, пропускаем сохранение в облако");
        return false;
      }

      try {
        // Определяем метод и URL в зависимости от наличия gistId
        const method = this.gistId ? "PATCH" : "POST";
        const url = this.gistId
          ? `https://api.github.com/gists/${this.gistId}`
          : "https://api.github.com/gists";

        if (CONFIG.DEBUG) console.log(`${method} запрос к ${url}`);

        // Формируем тело запроса
        const requestBody = {
          description: "One Piece Tracker Mobile Progress",
          public: false,
          files: {
            "anime-progress-mobile.json": {
              content: JSON.stringify(data, null, 2),
            },
          },
        };

        // Выполняем запрос
        const response = await fetch(url, {
          method: method,
          headers: {
            Authorization: `token ${CONFIG.GITHUB_TOKEN}`,
            "Content-Type": "application/json",
            Accept: "application/vnd.github.v3+json",
          },
          body: JSON.stringify(requestBody),
        });

        // Обрабатываем ответ
        if (response.ok) {
          const responseData = await response.json();

          // Если это новый Gist, сохраняем его ID
          if (responseData.id && !this.gistId) {
            this.gistId = responseData.id;
            localStorage.setItem("onePieceGistId", this.gistId);
            if (CONFIG.DEBUG)
              console.log("Создан новый Gist с ID:", this.gistId);
          }

          if (CONFIG.DEBUG)
            console.log("Прогресс успешно сохранен в облачное хранилище");
          return true;
        } else {
          const errorText = await response.text();
          console.error(`GitHub API ошибка (${response.status}): ${errorText}`);

          // Если Gist не найден, сбрасываем ID и пробуем создать новый при следующем сохранении
          if (response.status === 404 && this.gistId) {
            console.log("Gist не найден, сбрасываем ID");
            this.gistId = null;
            localStorage.removeItem("onePieceGistId");
          }

          return false;
        }
      } catch (error) {
        console.error("Ошибка при сохранении в Gist:", error);
        return false;
      }
    },

    // Загрузка данных из GitHub Gist
    async loadFromGist() {
      if (CONFIG.DEBUG) console.log("Попытка загрузки из Gist");

      // Если нет токена или ID - не загружаем
      if (!CONFIG.GITHUB_TOKEN) {
        console.log("GitHub токен не найден, пропускаем загрузку из облака");
        return null;
      }

      if (!this.gistId) {
        console.log("ID Gist не найден, нужно сначала сохранить прогресс");
        return null;
      }

      try {
        // Получаем содержимое Gist
        if (CONFIG.DEBUG) console.log(`Загрузка Gist с ID: ${this.gistId}`);
        const response = await fetch(
          `https://api.github.com/gists/${this.gistId}`,
          {
            method: "GET",
            headers: {
              Authorization: `token ${CONFIG.GITHUB_TOKEN}`,
              Accept: "application/vnd.github.v3+json",
            },
          }
        );

        // Обработка ошибок
        if (!response.ok) {
          // Если Gist не найден, сбрасываем ID
          if (response.status === 404) {
            console.log("Gist не найден, сбрасываем ID");
            this.gistId = null;
            localStorage.removeItem("onePieceGistId");
            return null;
          }

          const errorText = await response.text();
          throw new Error(
            `GitHub API ошибка (${response.status}): ${errorText}`
          );
        }

        // Получаем данные из ответа
        const gistData = await response.json();

        // Проверяем наличие файла с прогрессом
        const progressFile =
          gistData.files &&
          (gistData.files["anime-progress-mobile.json"] ||
            gistData.files["anime-progress.json"] ||
            gistData.files["progress.json"]);

        if (progressFile) {
          try {
            const data = JSON.parse(progressFile.content);
            if (CONFIG.DEBUG)
              console.log("Данные успешно загружены из облака:", data);
            return data;
          } catch (e) {
            console.error("Ошибка парсинга JSON из Gist:", e);
            return null;
          }
        } else {
          console.log("Файл с прогрессом не найден в Gist");
          return null;
        }
      } catch (error) {
        console.error("Ошибка при загрузке из Gist:", error);
        return null;
      }
    },
  };

  // Получить номер эпизода из URL
  function getEpisodeNumber() {
    const match = window.location.href.match(/episode-(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  // Форматирование времени
  function formatTime(seconds) {
    if (!seconds) return "0:00";

    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return min + ":" + (sec < 10 ? "0" + sec : sec);
  }

  // Показать уведомление пользователю
  let activeNotification = null; // Для отслеживания активного уведомления
  function showNotification(message, duration = 3000) {
    try {
      // Если уже есть активное уведомление, удаляем его
      if (activeNotification && activeNotification.parentNode) {
        activeNotification.parentNode.removeChild(activeNotification);
      }

      // Создаем новое уведомление
      const notification = document.createElement("div");
      notification.className = "op-mobile-notification";
      notification.textContent = message;

      // Добавляем стили уведомления
      notification.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background-color: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 10px 20px;
                border-radius: 4px;
                z-index: 9999;
                text-align: center;
                min-width: 250px;
                max-width: 80%;
                font-size: 16px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                opacity: 1;
                transition: opacity 0.3s ease;
            `;

      document.body.appendChild(notification);
      activeNotification = notification; // Сохраняем ссылку

      // Автоматическое скрытие уведомления
      setTimeout(() => {
        notification.style.opacity = "0";
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
          if (activeNotification === notification) {
            activeNotification = null;
          }
        }, 300);
      }, duration);
    } catch (error) {
      console.error("Ошибка при показе уведомления:", error);
    }
  }

  // Показать уведомление в полноэкранном режиме
  let activeFullscreenNotification = null; // Отслеживаем активное уведомление в полноэкранном режиме
  function showFullscreenNotification(message) {
    // Проверяем, находится ли страница в полноэкранном режиме
    // Используем кросс-браузерные проверки
    const isFullScreen =
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement;

    if (isFullScreen) {
      // Удаляем предыдущее уведомление, если оно существует
      if (
        activeFullscreenNotification &&
        activeFullscreenNotification.parentNode
      ) {
        activeFullscreenNotification.parentNode.removeChild(
          activeFullscreenNotification
        );
      }

      // В полноэкранном режиме создаем уведомление и добавляем его к полноэкранному элементу
      const notification = document.createElement("div");
      notification.className =
        "op-mobile-notification op-mobile-fullscreen-notification";
      notification.textContent = message;

      // Стили для надежного отображения поверх видео
      notification.style.cssText = `
                display: block;
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background-color: rgba(0, 0, 0, 0.7);
                color: white;
                padding: 15px 20px;
                border-radius: 5px;
                font-size: 18px;
                text-align: center;
                z-index: 2147483647; /* Максимально возможный z-index */
                font-family: Arial, sans-serif;
                pointer-events: none; /* Чтобы уведомление не блокировало клики */
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
                opacity: 1;
                transition: opacity 0.3s ease;
            `;

      // Добавляем к полноэкранному элементу или body, если не удалось определить
      const targetElement = isFullScreen || document.body;
      targetElement.appendChild(notification);
      activeFullscreenNotification = notification; // Сохраняем ссылку

      // Плавное скрытие и удаление
      setTimeout(() => {
        notification.style.opacity = "0";
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
          if (activeFullscreenNotification === notification) {
            activeFullscreenNotification = null;
          }
        }, 300);
      }, 2000);
    } else {
      // Если не в полноэкранном режиме, используем обычное уведомление
      showNotification(message);
    }
  }

  // Сохранить прогресс просмотра
  async function saveProgress(episode, timestamp) {
    if (!episode || timestamp < 3) return;

    try {
      const now = Date.now();
      // Сохраняем не чаще раза в 5 секунд
      if (now - lastSaveTime < 5000) return;

      lastSaveTime = now;
      const progress = {
        episode: episode,
        timestamp: timestamp,
        savedAt: new Date().toISOString(),
      };

      localStorage.setItem("onePieceProgressMobile", JSON.stringify(progress));
      // Также сохраняем в формате основной версии для совместимости
      localStorage.setItem("onePieceProgress", JSON.stringify(progress));

      // Сохраняем в облачное хранилище, если включено
      if (CONFIG.USE_CLOUD && CONFIG.GITHUB_TOKEN) {
        try {
          await CloudStorage.saveToGist(progress);
          // Убираем уведомление о сохранении, так как оно отвлекает
          // showNotification('Прогресс синхронизирован ☁️', 1000);
        } catch (e) {
          console.error("Ошибка сохранения в облако:", e);
        }
      }

      // Отключаем уведомление о сохранении, так как оно слишком часто появляется
      // showNotification(`Прогресс обновлен: эпизод ${episode}, ${Math.floor(timestamp)}с ⌛`, 1000);

      return true;
    } catch (error) {
      console.error("Ошибка сохранения прогресса:", error);
      return false;
    }
  }

  // Получить последний сохраненный прогресс
  async function getLastProgress() {
    try {
      // Сначала проверяем локальное хранилище
      const localData = localStorage.getItem("onePieceProgressMobile");
      const localProgress = localData ? JSON.parse(localData) : null;

      // Затем проверяем прогресс из аккаунта
      const accountProgress = await getAccountProgress();

      // Проверяем облачное хранилище
      let cloudProgress = null;
      if (CONFIG.USE_CLOUD && CONFIG.GITHUB_TOKEN) {
        try {
          cloudProgress = await CloudStorage.loadFromGist();
          if (CONFIG.DEBUG && cloudProgress) {
            console.log("Получен прогресс из облака:", cloudProgress);
          }
        } catch (err) {
          console.error("Ошибка при загрузке из облака:", err);
        }
      }

      // Если нет ни локального, ни аккаунт прогресса, ни облачного - возвращаем дефолтное значение
      if (!localProgress && !accountProgress && !cloudProgress) {
        return { episode: 1, timestamp: 0 };
      }

      // Функция для сравнения прогрессов и выбора наиболее актуального
      const compareProgress = (a, b) => {
        if (!a) return b;
        if (!b) return a;

        // Сравниваем номера эпизодов
        if (a.episode !== b.episode) {
          return a.episode > b.episode ? a : b;
        }

        // Если эпизоды одинаковые, сравниваем timestamp
        if (a.timestamp !== b.timestamp) {
          return a.timestamp > b.timestamp ? a : b;
        }

        // Если все равно, выбираем по времени сохранения
        if (a.savedAt && b.savedAt) {
          return new Date(a.savedAt) > new Date(b.savedAt) ? a : b;
        }

        return a; // Если невозможно определить, возвращаем первый
      };

      // Находим наиболее актуальный прогресс
      let bestProgress = localProgress;
      bestProgress = compareProgress(bestProgress, accountProgress);
      bestProgress = compareProgress(bestProgress, cloudProgress);

      // Если выбранный прогресс не совпадает с локальным,
      // сохраняем его локально для синхронизации
      if (
        bestProgress &&
        (!localProgress ||
          bestProgress.episode !== localProgress.episode ||
          bestProgress.timestamp !== localProgress.timestamp)
      ) {
        saveProgress(bestProgress.episode, bestProgress.timestamp);
        showNotification(
          `🔄 Синхронизирован прогресс: Эпизод ${bestProgress.episode}`
        );
      }

      return bestProgress;
    } catch (error) {
      console.error("Ошибка при получении прогресса:", error);

      // В случае ошибки используем локальный прогресс или дефолтное значение
      const localData = localStorage.getItem("onePieceProgressMobile");
      return localData ? JSON.parse(localData) : { episode: 1, timestamp: 0 };
    }
  }

  // Восстановить прогресс
  function restoreProgress() {
    const video = Utils.findVideoPlayer();
    if (!video) return false;

    const progress = getLastProgress();
    const currentEpisode = getEpisodeNumber();

    if (
      progress &&
      progress.episode === currentEpisode &&
      progress.timestamp > 5
    ) {
      video.currentTime = progress.timestamp;
      showNotification(`⏮️ Продолжаем c ${formatTime(progress.timestamp)}`);
      return true;
    }

    return false;
  }

  // Синхронизация с аккаунтом
  async function syncWithAccount() {
    if (!CONFIG.SYNC_WITH_ACCOUNT) return;

    try {
      // Находим ссылки с отметкой просмотра
      const watchedLinks = document.querySelectorAll(
        "a.this_anime_was_watched"
      );
      if (watchedLinks.length === 0) return;

      const watchedEpisodes = [];

      for (const link of watchedLinks) {
        const match = link.href.match(/episode-(\d+)/);
        if (match) {
          watchedEpisodes.push(parseInt(match[1]));
        }
      }

      if (watchedEpisodes.length === 0) return;

      // Находим последний просмотренный эпизод
      const lastWatched = Math.max(...watchedEpisodes);

      // Получаем текущий прогресс из локального хранилища
      const localData = localStorage.getItem("onePieceProgressMobile");
      const localProgress = localData ? JSON.parse(localData) : null;

      // Получаем данные из облака отдельно
      let cloudProgress = null;
      if (CONFIG.USE_CLOUD && CONFIG.GITHUB_TOKEN) {
        try {
          cloudProgress = await CloudStorage.loadFromGist();
          if (CONFIG.DEBUG && cloudProgress) {
            console.log(
              "Получен прогресс из облака для синхронизации:",
              cloudProgress
            );
          }
        } catch (err) {
          console.error("Ошибка при загрузке из облака:", err);
        }
      }

      if (CONFIG.DEBUG) {
        console.log("Синхронизация:", {
          lastWatchedFromAccount: lastWatched,
          localProgress: localProgress,
          cloudProgress: cloudProgress,
        });
      }

      // Стратегия 1: В аккаунте более новый эпизод, и этот же эпизод есть в облаке с таймкодом
      if (
        lastWatched > (localProgress?.episode || 0) &&
        cloudProgress &&
        cloudProgress.episode === lastWatched &&
        cloudProgress.timestamp > 0
      ) {
        // Используем эпизод из аккаунта и таймкод из облака
        await saveProgress(lastWatched, cloudProgress.timestamp);
        showNotification(
          `🔄 Объединение данных: Эпизод ${lastWatched} (${formatTime(
            cloudProgress.timestamp
          )})`
        );
        return;
      }

      // Стратегия 2: В аккаунте более новый эпизод, но нет данных в облаке об этом эпизоде
      if (lastWatched > (localProgress?.episode || 0)) {
        await saveProgress(lastWatched, 0);
        showNotification(`🔄 Новый эпизод из аккаунта: ${lastWatched}`);
        return;
      }

      // Стратегия 3: Тот же эпизод что и локально, но в облаке есть прогресс по времени
      if (
        lastWatched === (localProgress?.episode || 0) &&
        cloudProgress &&
        cloudProgress.episode === lastWatched &&
        cloudProgress.timestamp > (localProgress?.timestamp || 0)
      ) {
        // Обновляем только таймкод
        await saveProgress(lastWatched, cloudProgress.timestamp);
        showNotification(
          `🔄 Обновлено время: ${formatTime(cloudProgress.timestamp)}`
        );
        return;
      }

      // Стратегия 4: В облаке более новый эпизод, чем в аккаунте и локально
      if (
        cloudProgress &&
        cloudProgress.episode > lastWatched &&
        cloudProgress.episode > (localProgress?.episode || 0)
      ) {
        // Используем данные из облака
        await saveProgress(cloudProgress.episode, cloudProgress.timestamp);
        showNotification(
          `🔄 Загружено из облака: Эпизод ${cloudProgress.episode}`
        );
        return;
      }
    } catch (error) {
      console.error("Ошибка при синхронизации с аккаунтом:", error);
    }
  }

  // Получение прогресса из аккаунта сайта
  async function getAccountProgress() {
    if (CONFIG.DEBUG) console.log("Получение прогресса из аккаунта...");

    try {
      // Найдем все просмотренные серии на странице
      const watchedEpisodes = [];
      const episodeLinks = document.querySelectorAll(
        "a.this_anime_was_watched"
      );

      if (CONFIG.DEBUG)
        console.log(
          "Найдено отмеченных просмотренных серий:",
          episodeLinks.length
        );

      if (episodeLinks.length === 0) {
        return null;
      }

      for (const link of episodeLinks) {
        // Извлекаем номер эпизода из ссылки разными способами
        let episodeNum = null;

        // Способ 1: из href через регулярное выражение
        const hrefMatch = link.href.match(/episode-(\d+)/);
        if (hrefMatch) {
          episodeNum = parseInt(hrefMatch[1]);
        }
        // Способ 2: из текста ссылки
        else {
          const textMatch = link.innerText.match(/(\d+)\s*серия/);
          if (textMatch) {
            episodeNum = parseInt(textMatch[1]);
          }
        }

        if (episodeNum && !isNaN(episodeNum)) {
          watchedEpisodes.push(episodeNum);
        }
      }

      // Сортируем эпизоды по возрастанию
      watchedEpisodes.sort((a, b) => a - b);

      if (CONFIG.DEBUG) console.log("Просмотренные эпизоды:", watchedEpisodes);

      if (watchedEpisodes.length === 0) {
        if (CONFIG.DEBUG) console.log("Не найдено просмотренных эпизодов");
        return null;
      }

      // Получаем последний просмотренный эпизод
      const lastWatchedEpisode = Math.max(...watchedEpisodes);

      if (CONFIG.DEBUG)
        console.log("Последний просмотренный эпизод:", lastWatchedEpisode);

      // Возвращаем прогресс для последнего эпизода
      return {
        episode: lastWatchedEpisode,
        timestamp: 0,
        savedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Ошибка при получении прогресса из аккаунта:", error);
      return null;
    }
  }

  // Добавляем функцию для проверки обновлений
  async function checkForUpdates() {
    try {
      const currentVersion = "2.2"; // Текущая версия скрипта (должна совпадать с @version)
      const scriptUrl =
        "https://raw.githubusercontent.com/n0bl3z/onepiecejutsu/main/oneepicejutsu.js";

      console.log("Проверка обновлений скрипта...");

      // Получаем содержимое скрипта с GitHub
      const response = await fetch(scriptUrl);
      if (!response.ok) {
        console.error("Не удалось получить скрипт с GitHub:", response.status);
        return;
      }

      const scriptContent = await response.text();

      // Извлекаем версию из скрипта
      const versionMatch = scriptContent.match(/@version\s+(\d+\.\d+)/);
      if (!versionMatch) {
        console.error("Не удалось определить версию скрипта");
        return;
      }

      const latestVersion = versionMatch[1];

      // Сравниваем версии
      if (parseFloat(latestVersion) > parseFloat(currentVersion)) {
        console.log(
          `Доступна новая версия: ${latestVersion} (текущая: ${currentVersion})`
        );
        showNotification(
          `Доступна новая версия скрипта: ${latestVersion}. Обновление выполнится автоматически при следующем запуске`,
          5000
        );

        // Отметим в localStorage, что есть новая версия
        localStorage.setItem("onePieceUpdateAvailable", "true");
      } else {
        console.log("У вас установлена последняя версия скрипта");
      }
    } catch (error) {
      console.error("Ошибка при проверке обновлений:", error);
    }
  }

  // Функция для поиска и нажатия кнопки "Пропустить заставку" - оптимизирована для мобильных устройств
  function findSkipIntroButton() {
    try {
      // Проверяем кэш сначала для ускорения
      const cachedButton = sessionStorage.getItem("skipButtonCache");
      if (cachedButton) {
        const cachedData = JSON.parse(cachedButton);
        // Проверяем актуальность кэша (не старше 500мс) и текущий URL
        if (
          Date.now() - cachedData.timestamp < 500 &&
          cachedData.url === window.location.href
        ) {
          // Если уже кликали на кнопку, возвращаем null
          if (cachedData.clicked) return null;

          // Пробуем найти элемент по селектору из кэша
          const element = document.querySelector(cachedData.selector);
          if (
            element &&
            !element.classList.contains("vjs-hidden") &&
            element.offsetParent !== null
          ) {
            return element;
          }
        }
      }

      // Проверяем, нажимали ли мы уже на кнопку ранее (только для текущего видео)
      const currentVideoUrl = window.location.href;
      const alreadySkipped = sessionStorage.getItem(
        "skip_intro_clicked_" + currentVideoUrl
      );
      if (alreadySkipped) {
        return null;
      }

      // Оптимизированные селекторы для кнопки "Пропустить заставку" на jut.su
      // Отсортированы по вероятности нахождения для быстрого поиска
      const selectors = [
        ".vjs-overlay-skip-intro:not(.vjs-hidden)",
        ".vjs-overlay-bottom-left:not(.vjs-hidden)",
        ".vjs-overlay-background:not(.vjs-hidden)",
        '[title="Нажмите, если лень смотреть опенинг"]:not(.vjs-hidden)',
        ".vjs-overlay:not(.vjs-hidden):not(.vjs-hidden-component)",
        ".skip-intro-button:not(.vjs-hidden)",
        "[data-skip-intro]:not(.vjs-hidden)",
        ".skip-intro:not(.vjs-hidden)",
        ".skipButton:not(.vjs-hidden)",
      ];

      // Быстрый проход по всем селекторам
      for (let i = 0; i < selectors.length; i++) {
        try {
          const elements = document.querySelectorAll(selectors[i]);

          for (const el of elements) {
            if (!el) continue;

            // Проверка текста/заголовка без регулярных выражений для скорости
            const text = el.innerText && el.innerText.toLowerCase();
            const title = el.title && el.title.toLowerCase();

            if (
              (text &&
                (text.includes("пропустить") || text.includes("заставку"))) ||
              (title && title.includes("опенинг")) ||
              (el.className &&
                (el.className.includes("skip") ||
                  el.className.includes("intro")))
            ) {
              // Проверка видимости - только основные критерии
              if (el.offsetParent !== null) {
                // Кэшируем для будущих вызовов
                sessionStorage.setItem(
                  "skipButtonCache",
                  JSON.stringify({
                    selector: selectors[i],
                    timestamp: Date.now(),
                    url: window.location.href,
                    clicked: false,
                  })
                );

                return el;
              }
            }
          }
        } catch (e) {
          // Тихо игнорируем ошибки для скорости
        }
      }

      return null;
    } catch (error) {
      console.error("Ошибка при поиске кнопки пропуска заставки:", error);
      return null;
    }
  }

  // Функция для поиска кнопки следующей серии
  function findNextEpisodeButton() {
    try {
      if (CONFIG.DEBUG)
        console.log("Поиск кнопки следующей серии на мобильной версии...");

      // Получаем текущий и следующий эпизод
      const currentEpisode = getEpisodeNumber();
      const nextEpisode = currentEpisode ? parseInt(currentEpisode) + 1 : null;

      if (CONFIG.DEBUG)
        console.log(
          "Текущий эпизод:",
          currentEpisode,
          "Следующий эпизод:",
          nextEpisode
        );

      // Различные селекторы для кнопки "Следующая серия" на разных сайтах
      const selectors = [
        // Специфичные для jut.su на мобильных
        ".next-link",
        "a.short-btn.green",
        // Стандартные кнопки навигации
        ".next-episode-button",
        "[data-next-episode]",
        ".vjs-overlay-next-episode",
        ".next-episode",
        ".nextButton",
        // По тексту кнопок
        'a:contains("Следующая серия")',
        'a:contains("След. серия")',
        'a:contains("Следующая")',
        'a:contains("След")',
        "a.next-episode",
        "a.next_episode",
        "a.button_next",
        'a[title*="Следующая"]',
        // По классам содержащим "next"
        '[class*="next"]:not([disabled])',
        '[class*="navigation"] [class*="next"]',
      ];

      // Добавляем селекторы на основе номера следующего эпизода, если известен
      if (nextEpisode) {
        selectors.push(`a[href*="episode-${nextEpisode}"]`);
        selectors.push(`a[href*="episode-${nextEpisode}.html"]`);
        selectors.push(`[data-episode="${nextEpisode}"]`);
        selectors.push(`[data-id="${nextEpisode}"]`);
      }

      // Пробуем найти по селекторам
      for (const selector of selectors) {
        try {
          const elements = document.querySelectorAll(selector);

          if (CONFIG.DEBUG && elements.length > 0) {
            console.log(
              `Найдено ${elements.length} элементов по селектору "${selector}"`
            );
          }

          for (const el of elements) {
            if (!el) continue;

            // Проверяем, содержит ли текст или атрибуты указание на следующий эпизод
            const text = (el.innerText || "").toLowerCase();
            const title = (el.title || "").toLowerCase();
            const ariaLabel = (
              el.getAttribute("aria-label") || ""
            ).toLowerCase();
            const href = (el.href || "").toLowerCase();

            if (
              text.match(/следующ|next|вперед|серия|\>/i) ||
              title.match(/следующ|next|вперед|серия|\>/i) ||
              ariaLabel.match(/следующ|next|вперед|серия|\>/i) ||
              (nextEpisode && href && href.includes(`episode-${nextEpisode}`))
            ) {
              if (CONFIG.DEBUG)
                console.log("Найдена кнопка следующей серии:", el);
              return el;
            }
          }
        } catch (e) {
          if (CONFIG.DEBUG)
            console.error(`Ошибка при поиске по селектору "${selector}":`, e);
        }
      }

      // Дополнительный поиск по всем ссылкам на странице (для сложных случаев)
      if (nextEpisode) {
        const allLinks = document.querySelectorAll('a[href*="episode-"]');
        for (const link of allLinks) {
          const href = link.href || "";
          const match = href.match(/episode-(\d+)/i);

          if (match && parseInt(match[1]) === nextEpisode) {
            if (CONFIG.DEBUG)
              console.log(
                "Найдена ссылка на следующий эпизод по номеру:",
                link
              );
            return link;
          }
        }
      }

      if (CONFIG.DEBUG) console.log("Кнопка следующей серии не найдена");
      return null;
    } catch (error) {
      console.error("Ошибка при поиске кнопки следующей серии:", error);
      return null;
    }
  }

  // Функция для автоматического нажатия кнопок
  // Настройка автоматических действий для кнопок (оптимизирована для мобильных устройств)
  function setupAutoButtonActions() {
    try {
      // Используем только один интервал для всех проверок
      const buttonsInterval = setInterval(() => {
        // 1. Проверяем "Пропустить заставку"
        const skipIntroButton = findSkipIntroButton();
        if (skipIntroButton) {
          Utils.forceClick(skipIntroButton);

          // Помечаем, что уже кликнули (для оптимизации)
          const currentVideoUrl = window.location.href;
          sessionStorage.setItem(
            "skip_intro_clicked_" + currentVideoUrl,
            "true"
          );

          // Показываем уведомление
          showNotification("Пропущена заставка! ⏭", 1500);
        }

        // 2. Проверяем "Следующая серия"
        const player = Utils.findVideoPlayer();
        if (player && player.ended) {
          // Видео закончилось, ищем кнопку следующей серии
          const nextButton = findNextEpisodeButton();
          if (nextButton) {
            Utils.forceClick(nextButton);
            showNotification("Переход к следующей серии ▶️", 1500);
          }
        }

        // 3. Проверяем промо и рекламу
        const promoElements = document.querySelectorAll(
          ".vjs-overlay, .vjs-overlay-promo, .vjs-promo-container"
        );
        for (const promo of promoElements) {
          if (
            promo &&
            !promo.classList.contains("vjs-hidden") &&
            promo.innerText &&
            !promo.innerText.toLowerCase().includes("пропустить")
          ) {
            promo.style.display = "none";
          }
        }
      }, CONFIG.BUTTON_CHECK_INTERVAL);

      // Очистка интервала при уходе со страницы для экономии ресурсов
      window.addEventListener("beforeunload", () => {
        clearInterval(buttonsInterval);
      });

      // Устанавливаем MutationObserver для отслеживания появления кнопки "Пропустить заставку"
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "childList" && mutation.addedNodes.length) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                // Быстрая проверка на возможную кнопку пропуска
                if (
                  (node.className &&
                    (node.className.includes("vjs-overlay") ||
                      node.className.includes("skip"))) ||
                  (node.innerText &&
                    (node.innerText.toLowerCase().includes("пропустить") ||
                      node.innerText.toLowerCase().includes("заставку")))
                ) {
                  const skipButton = findSkipIntroButton();
                  if (skipButton) {
                    Utils.forceClick(skipButton);

                    // Помечаем, что уже кликнули
                    const currentVideoUrl = window.location.href;
                    sessionStorage.setItem(
                      "skip_intro_clicked_" + currentVideoUrl,
                      "true"
                    );

                    showNotification("Пропущена заставка! ⏭", 1500);
                  }
                }
              }
            }
          }
        }
      });

      // Начинаем наблюдение за изменениями в DOM
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // Очистка наблюдателя при уходе со страницы
      window.addEventListener("beforeunload", () => {
        observer.disconnect();
      });

      return true;
    } catch (error) {
      console.error("Ошибка при настройке автодействий для кнопок:", error);
      return false;
    }
  }

  // Управление видео
  function setupVideoTracking() {
    const video = Utils.findVideoPlayer();
    if (!video) return;

    // Отслеживаем воспроизведение
    video.addEventListener("timeupdate", () => {
      if (!userInteractedWithVideo) return;

      const episodeNumber = getEpisodeNumber();
      if (episodeNumber) {
        saveProgress(episodeNumber, video.currentTime);
      }
    });

    // Отмечаем взаимодействие пользователя
    video.addEventListener("play", () => {
      userInteractedWithVideo = true;
    });

    // Сенсорные жесты
    setupTouchGestures(video);
  }

  // Настройка сенсорных жестов для видео
  // Настройка сенсорных жестов для управления видео (оптимизировано)
  function setupTouchGestures(video) {
    if (!video || !DEVICE.hasTouch) return;

    // Переменные для отслеживания жестов
    let touchStartX = 0;
    let touchStartY = 0;
    let startTime = 0;
    let startVolume = 0;
    let isGesture = false;
    let gestureType = null;
    let currentDiffX = 0;
    let currentDiffY = 0;
    let lastTapTime = 0;

    // Увеличиваем размер цели касания для лучшего взаимодействия
    const touchTargetSize = DEVICE.isMobile ? 48 : 32; // Увеличенная область касания для мобильных устройств

    // Начало касания
    video.addEventListener(
      "touchstart",
      (e) => {
        // Предотвращаем стандартное поведение, но только если уже опознали жест
        if (isGesture) {
          e.preventDefault();
          return;
        }

        // Получаем начальные координаты
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        startTime = video.currentTime;
        startVolume = video.volume;

        // Проверяем двойное касание для паузы/воспроизведения
        const now = Date.now();
        if (now - lastTapTime < 300) {
          // Двойное касание обнаружено
          if (video.paused) {
            video.play();
            showFullscreenNotification("▶️ Воспроизведение");
          } else {
            video.pause();
            showFullscreenNotification("⏸️ Пауза");
          }
          e.preventDefault();
          isGesture = true;
          lastTapTime = 0; // Сбрасываем, чтобы избежать срабатывания тройного тапа
        } else {
          lastTapTime = now;
        }
      },
      { passive: false }
    );

    // Движение касания
    video.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length !== 1) return;

        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;

        // Вычисляем разницу
        currentDiffX = touchX - touchStartX;
        currentDiffY = touchY - touchStartY;

        // Определяем тип жеста на основе абсолютных значений разницы
        const absX = Math.abs(currentDiffX);
        const absY = Math.abs(currentDiffY);

        // Жест должен быть достаточно большим, чтобы его засчитать
        const minThreshold = DEVICE.isMobile ? 15 : 10;

        if (!isGesture && (absX > minThreshold || absY > minThreshold)) {
          // Определяем тип жеста
          if (absX > absY) {
            // Горизонтальный жест = перемотка
            isGesture = true;
            gestureType = "seek";

            // Только отображаем информацию о предстоящей перемотке
            const seekAmount = currentDiffX / 3; // Снижаем чувствительность для мобильных
            const newTime = Math.max(
              0,
              Math.min(video.duration, startTime + seekAmount)
            );

            showFullscreenNotification(
              `${currentDiffX > 0 ? "⏩" : "⏪"} ${formatTime(newTime)}`
            );
            e.preventDefault();
          } else if (absY > absX) {
            // Вертикальный жест = громкость
            isGesture = true;
            gestureType = "volume";

            // Отображаем информацию о предстоящем изменении громкости
            const volumeChange =
              (-currentDiffY / 200) * CONFIG.TOUCH_SENSITIVITY;
            const newVolume = Math.max(
              0,
              Math.min(1, startVolume + volumeChange)
            );

            showFullscreenNotification(`🔊 ${Math.round(newVolume * 100)}%`);
            e.preventDefault();
          }
        } else if (isGesture) {
          // Обновляем информацию во время жеста
          if (gestureType === "seek") {
            const seekAmount = (currentDiffX / 3) * CONFIG.TOUCH_SENSITIVITY;
            const newTime = Math.max(
              0,
              Math.min(video.duration, startTime + seekAmount)
            );
            showFullscreenNotification(
              `${currentDiffX > 0 ? "⏩" : "⏪"} ${formatTime(newTime)}`
            );
            e.preventDefault();
          } else if (gestureType === "volume") {
            const volumeChange =
              (-currentDiffY / 200) * CONFIG.TOUCH_SENSITIVITY;
            const newVolume = Math.max(
              0,
              Math.min(1, startVolume + volumeChange)
            );
            showFullscreenNotification(`🔊 ${Math.round(newVolume * 100)}%`);
            e.preventDefault();
          }
        }
      },
      { passive: false }
    );

    // Окончание касания
    video.addEventListener(
      "touchend",
      (e) => {
        if (isGesture && gestureType) {
          e.preventDefault(); // Предотвращаем клик, если был распознан жест

          // Применяем жест
          if (gestureType === "seek") {
            // Применяем перемотку
            const seekAmount = (currentDiffX / 3) * CONFIG.TOUCH_SENSITIVITY;
            const newTime = Math.max(
              0,
              Math.min(video.duration, startTime + seekAmount)
            );
            video.currentTime = newTime;

            // Финальное уведомление
            showFullscreenNotification(
              `${currentDiffX > 0 ? "⏩" : "⏪"} ${formatTime(newTime)}`
            );
          } else if (gestureType === "volume") {
            // Применяем изменение громкости
            const volumeChange =
              (-currentDiffY / 200) * CONFIG.TOUCH_SENSITIVITY;
            const newVolume = Math.max(
              0,
              Math.min(1, startVolume + volumeChange)
            );
            video.volume = newVolume;

            // Финальное уведомление
            showFullscreenNotification(`🔊 ${Math.round(newVolume * 100)}%`);
          }
        }

        isGesture = false;
        gestureType = null;
      },
      { passive: false }
    );
  }

  // Добавляем стили для мобильных устройств
  function addMobileStyles() {
    const css = `
            .op-mobile-notification {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background-color: rgba(0, 0, 0, 0.7);
                color: white;
                padding: 10px 15px;
                border-radius: 5px;
                z-index: 9999;
                font-size: 16px;
                text-align: center;
                max-width: 80%;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
                pointer-events: none;
                display: none;
            }

            .op-mobile-notification-fullscreen {
                position: fixed;
                z-index: 999999 !important; /* Очень высокий z-index для полноэкранного режима */
                background-color: rgba(0, 0, 0, 0.8);
                padding: 15px 20px;
                font-size: 18px;
                border-radius: 10px;
                box-shadow: 0 3px 15px rgba(0, 0, 0, 0.5);
                pointer-events: none;
            }

            /* Стили только для нашей кнопки продолжения просмотра */
            .continue-wrapper-mobile {
                position: fixed;
                bottom: 20px;
                left: 0;
                right: 0;
                display: flex;
                justify-content: center;
                padding: 0 10px;
                z-index: 998;
                pointer-events: none;
            }

            /* Делаем селектор более специфичным */
            .continue-wrapper-mobile .continue-button-mobile {
                display: flex;
                align-items: center;
                width: 90%;
                max-width: 600px;
                padding: 12px 15px;
                background: linear-gradient(135deg, #3498db, #2980b9);
                color: white !important;
                border-radius: 10px;
                text-decoration: none !important;
                box-shadow: 0 3px 10px rgba(0,0,0,0.3);
                margin: 0;
                transition: all 0.2s ease;
                pointer-events: auto; /* восстанавливаем события только для кнопки */
                animation: continue-button-appear 0.5s ease forwards;
            }

            @keyframes continue-button-appear {
                from {
                    transform: translateY(30px);
                    opacity: 0;
                }
                to {
                    transform: translateY(0);
                    opacity: 1;
                }
            }

            .continue-wrapper-mobile .continue-button-mobile:active {
                transform: scale(0.97);
                background: linear-gradient(135deg, #2980b9, #2471a3);
            }

            .continue-wrapper-mobile .continue-icon-mobile {
                font-size: 24px;
                margin-right: 10px;
            }

            .continue-wrapper-mobile .continue-text-mobile {
                flex: 1;
            }

            .continue-wrapper-mobile .continue-title-mobile {
                font-weight: bold;
                font-size: 16px;
                margin-bottom: 3px;
            }

            .continue-wrapper-mobile .continue-subtitle-mobile {
                font-size: 14px;
                opacity: 0.8;
            }

            video {
                width: 100% !important;
                height: auto !important;
            }

            /* Увеличиваем размеры элементов для сенсорного управления */
            .vjs-control-bar button,
            [class*="control"] button,
            button,
            [role="button"],
            a[href] {
                min-height: 40px !important;
                min-width: 40px !important;
            }

            /* Добавляем дополнительный класс для контейнера серий */
            .series-container {
                padding: 10px;
                background-color: #f9f9f9;
                border: 1px solid #ddd;
                border-radius: 5px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            }

            /* Кнопка в обычном режиме */
            .continue-button {
                display: block;
                margin: 20px auto;
                padding: 10px 15px;
                background: linear-gradient(135deg, #3498db, #2980b9);
                color: white;
                border-radius: 5px;
                text-align: center;
                font-weight: bold;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
            }
        `;

    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    // Отключаем масштабирование для избежания случайного зума
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      viewport.setAttribute(
        "content",
        "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
      );
    } else {
      const meta = document.createElement("meta");
      meta.name = "viewport";
      meta.content =
        "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";
      document.head.appendChild(meta);
    }
  }

  // Добавляем кнопку продолжения просмотра
  async function addContinueButton() {
    try {
      // Получаем последний сохраненный прогресс
      const progress = await getLastProgress();

      if (!progress || !progress.episode) {
        if (CONFIG.DEBUG)
          console.log("Нет сохраненного прогресса для кнопки продолжения");
        return;
      }

      // Проверяем, не находимся ли мы уже на странице этого эпизода
      const currentEpisode = getEpisodeNumber();
      if (currentEpisode === progress.episode) return;

      if (CONFIG.DEBUG)
        console.log(
          "Добавляем кнопку продолжения просмотра для эпизода:",
          progress.episode
        );

      // Создаем кнопку
      const button = document.createElement("a");
      button.className = "continue-button-mobile";
      button.href = `/oneepiece/episode-${progress.episode}.html`;
      button.innerHTML = `
                <div class="continue-icon-mobile">▶️</div>
                <div class="continue-text-mobile">
                    <div class="continue-title-mobile">Продолжить просмотр</div>
                    <div class="continue-subtitle-mobile">Эпизод ${
                      progress.episode
                    } (${formatTime(progress.timestamp)})</div>
                </div>
            `;

      // Добавляем на страницу как фиксированный элемент
      const wrapper = document.createElement("div");
      wrapper.className = "continue-wrapper-mobile";
      wrapper.appendChild(button);

      // Вставляем в конец body, чтобы не смещать другие элементы
      document.body.appendChild(wrapper);

      // Добавляем отложенное исчезновение кнопки
      setTimeout(() => {
        // Проверяем, существует ли ещё wrapper (возможно, страница уже изменилась)
        if (document.body.contains(wrapper)) {
          // Добавляем обработчик, чтобы скрывать кнопку при скролле вниз
          let lastScrollY = window.scrollY;
          const scrollThreshold = 50;

          const scrollHandler = () => {
            // Если скроллим вниз более чем на 50px, скрываем кнопку
            if (window.scrollY - lastScrollY > scrollThreshold) {
              wrapper.style.opacity = "0";
              wrapper.style.pointerEvents = "none";

              // При скролле вверх снова показываем кнопку
            } else if (lastScrollY - window.scrollY > scrollThreshold) {
              wrapper.style.opacity = "1";
              wrapper.style.pointerEvents = "auto";
            }

            lastScrollY = window.scrollY;
          };

          window.addEventListener("scroll", scrollHandler);

          // Удаляем обработчик, когда пользователь уходит со страницы
          window.addEventListener("unload", () => {
            window.removeEventListener("scroll", scrollHandler);
          });
        }
      }, 100);

      // Уведомление о загрузке прогресса
      showNotification(
        `Загружен прогресс: Эпизод ${progress.episode} ✅`,
        2000
      );

      return true;
    } catch (error) {
      console.error("Ошибка при добавлении кнопки продолжения:", error);
      return false;
    }
  }

  // Функция, которая должна вызываться при загрузке новой страницы или видео
  function resetVideoState() {
    // Очищаем флаги для текущего видео
    const oldItems = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith("skip_intro_clicked_")) {
        // Собираем ключи для текущих URL, которые больше не актуальны
        if (!key.includes(window.location.href)) {
          oldItems.push(key);
        }
      }
    }

    // Удаляем устаревшие ключи
    oldItems.forEach((key) => {
      sessionStorage.removeItem(key);
    });

    console.log("Состояние видео сброшено для нового эпизода");
  }

  // Вызываем сброс состояния при загрузке страницы
  resetVideoState();

  // Проверяем обновления скрипта
  checkForUpdates();

  // Инициализация скрипта
  // Инициализация скрипта
  async function init() {
    try {
      // Сначала проверяем обновления
      checkForUpdates();

      // Добавляем мобильные стили
      addMobileStyles();

      // Очищаем кэши при запуске для избежания проблем
      ElementCache.clear();

      // Определяем текущую страницу
      const episodeNumber = getEpisodeNumber();

      if (episodeNumber) {
        // На странице эпизода
        console.log("One Piece Mobile: страница эпизода", episodeNumber);

        // Настраиваем отслеживание видео - сразу для более быстрого отклика
        setupVideoTracking();

        // Настраиваем автоматические действия для кнопок
        setupAutoButtonActions();

        // Параллельно запускаем синхронизацию с аккаунтом
        syncWithAccount().catch((e) =>
          console.error("Ошибка синхронизации:", e)
        );

        // Затем восстанавливаем прогресс просмотра
        setTimeout(restoreProgress, 500); // Уменьшаем задержку для быстрого восстановления
      } else if (window.location.href.includes("/oneepiece/")) {
        // На общей странице
        console.log("One Piece Mobile: главная страница");

        // Параллельно запускаем синхронизацию с аккаунтом
        syncWithAccount().catch((e) =>
          console.error("Ошибка синхронизации:", e)
        );

        // Затем добавляем кнопку "Продолжить просмотр"
        setTimeout(addContinueButton, 300); // Уменьшаем задержку
      }
    } catch (error) {
      console.error("One Piece Mobile: ошибка инициализации", error);
    }
  }

  // Запускаем после полной загрузки страницы
  if (document.readyState === "complete") {
    init();
  } else {
    window.addEventListener("load", init);
  }
})();
