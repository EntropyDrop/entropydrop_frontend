# 3D printing download terms

- `1.0.json` is the text of the standalone *3D Printing Download Service Terms* version 1.0,
  kept as an archive of what users accepted before downloading. The per-user acceptance columns
  (`users.figure_print_terms_version` / `figure_print_terms_accepted_at`) were dropped by backend
  migration `c5e8a17d3b92`.
- From 2026-11-10 these terms are Section 18 of the Terms of Service (“Custom Product File Downloads (Including 3D Printing)”, `/skin/tos#custom-product-files`).
  The separate download confirmation and its API were removed, and every user was asked to accept the
  updated Terms of Service again (backend migration `a3d58e1f7c94`). No new versions are archived here.
