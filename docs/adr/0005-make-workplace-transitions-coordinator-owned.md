# Make Workplace transitions coordinator-owned

Creation, switching, and deletion are coordinated state transitions, not independent preference or UI actions. Each active creation or Import attempt has an in-memory operation identity; wizard drafts are not persisted. Deletion unmounts books before removing data and reruns the launch resolver; switching validates and durably persists the target before resetting navigation to its Hub. Cached or stale Workplace data never authorizes books providers.
