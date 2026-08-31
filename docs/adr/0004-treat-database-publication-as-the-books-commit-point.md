# Treat database publication as the books commit point

Workplace creation and Import commit the Workplace and its required books rows in one database transaction. Active workplace and Device claimed live in a separate preference store, so they are recoverable follow-up pointers rather than participants in a fake cross-store transaction. If a pointer write fails after database publication, the books remain valid and the launch coordinator repairs the pointer during the current launch when possible, or on a later launch through the pending marker.
