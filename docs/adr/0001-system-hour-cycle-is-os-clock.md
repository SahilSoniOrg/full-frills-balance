# System hour cycle follows the OS 24-hour clock, not locale

Hour cycle preference `system` reads the device OS 24-hour clock (`uses24hourClock`). Locale typical cycle (`en-US` → 12-hour, `de-DE` → 24-hour) is ignored, because users can force 24-hour time in OS settings while keeping a 12-hour locale. If the OS does not report a value, the 12-hour cycle is used.
