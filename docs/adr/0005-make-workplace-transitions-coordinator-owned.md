# Make Workplace transitions coordinator-owned

Opening, switching, and deletion are coordinator-owned state transitions, not independent preference or UI actions. Setup and restore finishers publish or verify a Workplace, then emit a typed outcome; the launch coordinator validates and opens that target through its normal transition path. Deletion unmounts books before removing data and reruns launch resolution. Cached data, stale pointers, Setup screens, and import screens never authorize books providers directly.
