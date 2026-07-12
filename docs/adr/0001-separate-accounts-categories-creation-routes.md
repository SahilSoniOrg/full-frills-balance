# Separate routes and screens for creating Accounts and Categories

We decided to create a separate `/category-creation` route and dedicated screen components (`CategoryFormView`) rather than reusing the existing `/account-creation` form. While both entities are stored as records in the same underlying WatermelonDB `accounts` collection, their visual presentation, terminology (e.g., hiding initial balances, using parent category labels), and metadata diverge significantly, and separating their entry screens prevents the main form logic from becoming a dumping ground for conditional branching.
