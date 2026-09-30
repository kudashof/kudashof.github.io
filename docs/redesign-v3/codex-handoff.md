# Handoff и QA для Codex — Variant 3

Источник: [Google Doc](https://docs.google.com/document/d/12rwJcMGXobvBqTFxDKPGUsiEBEmY_2wcDwFfRexVFyM/edit). Снимок документа от 2026-09-30; этот файл — локальная копия для разработки.

**Текущий статус:** Алексей уточнил 2026-09-30, что макет ещё в разработке. Начинай с технического аудита; стилизацию по финальному Variant 3 начни после его завершения и утверждения. Это уточнение имеет приоритет над формулировкой исходного документа «визуально утверждён» ниже. См. [manifest.json](manifest.json) и [technical-baseline.md](technical-baseline.md).

КОНТЕКСТ
GitHub уже подключён в Codex. Визуально утверждён Variant 3. Цветовая версия 3.1 НЕ утверждена. Реализовать нужно Variant 3, сохранив его палитру, и добавить к нему живую современную анимацию.


ВАЖНЕЙШЕЕ СТОП-УСЛОВИЕ
Перед изменением стилей найди источник утверждённого Variant 3: изображение, макет, ассеты, предыдущую реализацию или документ с точными цветами/типографикой.
Если такого источника в репозитории/доступных материалах нет, НЕ придумывай палитру и не переноси 3.1. Подготовь техническую основу без финальной стилизации и запроси Variant 3 как visual source.


## 0. СНАЧАЛА ПРОВЕДИ READ-ONLY АУДИТ
- Определи stack/framework/build tool.
- Найди entry points, глобальные стили, tokens/theme, routing, assets.
- Определи текущие страницы и основные компоненты.
- Найди существующую анимационную библиотеку, если есть.
- Найди текущий способ сборки и деплоя.
- Запусти существующие lint/test/build команды без изменения кода.
- Зафиксируй baseline ошибок, Lighthouse/Web Vitals если доступны.


## 1. СОЗДАЙ ПЛАН ИЗМЕНЕНИЙ
До редактирования перечисли:
- какие файлы меняются;
- какие новые компоненты/tokens/motion utilities появятся;
- что остаётся нетронутым;
- какие риски есть для SEO, accessibility, performance и deployment.


## 2. ЗАЩИТИ ВИЗУАЛЬНЫЙ ИСТОЧНИК
- Variant 3 = source of truth.
- Не использовать цвета 3.1.
- Извлечь palette/typography/radii/shadows/spacing из Variant 3 и оформить как semantic tokens, если архитектура проекта позволяет.
- Не переписывать весь CSS только ради «чистоты», если это создаёт риск.


## 3. РЕАЛИЗУЙ СТРУКТУРУ И RESPONSIVE
- Сначала статическая визуальная верность Variant 3.
- Затем responsive desktop/tablet/mobile.
- Не начинай motion до того, как layout стабилен.
- Проверить отсутствие horizontal overflow.
- Проверить реальный длинный контент.


## 4. РЕАЛИЗУЙ MOTION СЛОЯМИ
Layer A - microinteractions:
- buttons, links, cards, menu states.
Layer B - section reveal:
- IntersectionObserver или эквивалент.
- transform + opacity.
Layer C - hero:
- intro stagger;
- максимум 1-2 ambient effects;
- pointer-reactive только desktop при необходимости.
Layer D - selective section transitions:
- только ключевые переходы.


Не добавляй тяжёлую библиотеку анимации, если существующий stack или CSS/Web Animations API решает задачу проще. Если библиотека уже есть, предпочитай её вместо второй.


## 5. MOTION VALUES
Ориентиры:
- feedback 90-140 ms;
- hover 160-220 ms;
- component transition 220-320 ms;
- section reveal 400-650 ms;
- hero intro 550-900 ms;
- stagger 50-100 ms;
- small translate 8-20 px.
Это ориентиры, а не причина ломать характер Variant 3.


## 6. REDUCED MOTION
Добавить полноценную ветку prefers-reduced-motion: reduce:
- убрать parallax;
- убрать pointer-follow;
- убрать looping decorative motion;
- убрать крупные positional transforms;
- сохранить быстрые state changes и весь функционал.


## 7. ACCESSIBILITY
Цель WCAG 2.2 AA.
- Semantic HTML.
- Correct heading order.
- Visible focus-visible.
- Keyboard menu/navigation.
- Accessible labels.
- Alt policy.
- Не полагаться только на hover/цвет.
- Touch targets не делать меньше разумного минимального размера.


## 8. PERFORMANCE
Целевые ориентиры:
- LCP <= 2.5 s;
- INP <= 200 ms;
- CLS <= 0.1.
Не допускается ухудшать Core Web Vitals ради декоративной анимации.
Проверить:
- размеры изображений;
- width/height/aspect-ratio для media;
- font loading;
- lazy loading;
- JS bundle impact;
- long tasks;
- layout thrashing;
- animation listeners.


## 9. SEO / CONTENT SAFETY
- Сохранить URL и метаданные, если redesign не требует изменений.
- Не превращать смысловые тексты в canvas/image.
- Не менять контентную семантику без необходимости.
- Hero heading должен оставаться реальным текстом.


## 10. ПРОВЕРКИ ПОСЛЕ КАЖДОГО ЭТАПА
После static layout:
- build/lint/tests;
- desktop/mobile screenshots;
- overflow check.
После responsive:
- 320, 360, 390/393, 430 px;
- tablet;
- desktop.
После motion:
- normal motion;
- reduced motion;
- touch;
- keyboard;
- fast scroll;
- menu stress test.
Перед завершением:
- production build;
- console errors;
- broken links/assets;
- Lighthouse или эквивалент;
- compare screenshots with Variant 3.


## 11. GIT РАБОТА
- Работай в отдельной ветке, если это соответствует текущему workflow репозитория.
- Делай логические коммиты: tokens/layout, responsive, motion, accessibility/performance fixes.
- Не пушь в production/main без явного согласования, если текущие правила репозитория не говорят обратного.


## 12. ЧТО ПОКАЗАТЬ АЛЕКСУ ПОСЛЕ РЕАЛИЗАЦИИ
- Краткий changelog.
- Список изменённых файлов.
- Ссылка/способ открыть preview.
- Скриншоты минимум: desktop hero, desktop mid-page, mobile hero, mobile mid-page.
- Отдельно: normal motion и reduced-motion поведение.
- Результаты build/test/lint.
- Performance metrics до/после, если baseline доступен.
- Нерешённые вопросы и риски.


## 13. DEFINITION OF DONE
- Визуально это Variant 3, а не 3.1.
- Палитра Variant 3 сохранена.
- Responsive закончен.
- Motion выглядит живо и разнообразно, но не мешает.
- Reduced motion работает.
- Keyboard/touch работают.
- Нет заметного CLS.
- Build/tests проходят либо существующие baseline failures явно задокументированы.
- Производительность не ухудшена ради эффектов.
- Есть preview/скриншоты для визуальной проверки.


ПОРЯДОК ВЫПОЛНЕНИЯ CODEX
Audit -> plan -> Variant 3 tokens/static layout -> responsive -> microinteractions -> hero/scroll motion -> reduced motion -> accessibility -> performance -> QA -> preview/report.


НЕ ДЕЛАТЬ
- Не перекрашивать в 3.1.
- Не делать новый дизайн «по своему вкусу».
- Не начинать с WebGL/Three.js/гигантской motion-библиотеки.
- Не переписывать проект целиком без технической необходимости.
- Не деплоить production без предусмотренного проектом безопасного процесса/согласования.
