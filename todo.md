# Project TODO

- [x] Add persistent study materials schema with title, subject, semester, description, file URL, S3 key, MIME type, size, uploader, and timestamps
- [x] Investigate S3 object deletion; the platform storage skill and live endpoint probes confirm no supported delete route is exposed, so this limitation is documented
- [x] Add public/read-only material listing procedure with subject and semester filtering
- [x] Add material detail procedure for full metadata and viewer access
- [x] Add admin-only upload procedure with metadata validation and S3 persistence
- [x] Document the hard-delete limitation: database hard delete, file-key removal, and admin UI flow are implemented, but true object deletion requires a platform-supported S3 delete API
- [x] Enforce role-gated upload and delete access in server procedures
- [x] Build elegant student dashboard with sidebar navigation, search, subject filters, semester filters, and material grid/list
- [x] Include subject options for Data Structures, Networking, and OS
- [x] Include semester options from 1st through 8th semester
- [x] Build material detail page with embedded PDF/document viewer and download fallback
- [x] Build admin management panel with upload form, metadata fields, file picker, material table, and delete confirmation
- [x] Hide admin navigation and controls from student-role users
- [x] Add loading, empty, error, success, and validation states across the platform
- [x] Add/update Vitest coverage for list, detail, validation, and role-based access control procedures
- [x] Run type checks, tests, and visual verification; refine responsive polish; documented storage deletion limitation
- [x] Save final checkpoint and deliver project version

- [x] Remove the application-level 15 MB upload rejection and support larger admin materials within the increased 200 MB application transport ceiling
- [x] Make repeated uploads resilient with clear success/error handling and cache refresh without losing existing materials
- [x] Verify persistence behavior in the database-backed material list and preserve materials until explicit admin deletion
