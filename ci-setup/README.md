# CI setup — one manual move

Claude is not allowed to write into `.github/workflows/` on your machine (it is a protected folder, because files there run code on GitHub).

Do this once, in Windows Explorer, inside the `viking-4x` folder:

1. Create a folder named `.github` (with the leading dot).
2. Inside it, create a folder named `workflows`.
3. Move `ci-setup/ci.yml` into `.github/workflows/`.
4. Delete the `ci-setup` folder.

Then commit and push in GitHub Desktop. The three checks (server, Godot project, OpenAPI) run on GitHub automatically.
