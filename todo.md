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

- [x] Add persistent student registry table for admin-approved student IDs and profile information
- [x] Add admin-only single student registration and deletion procedures
- [x] Add admin-only Excel student-ID import with validation, duplicate handling, and clear results
- [x] Add admin student registry UI for single entry, Excel upload, listing, and deletion
- [x] Validate student login/registration against the admin-approved student ID registry and matching signed-in account email
- [x] Add tests for registry persistence, Excel import validation, duplicate handling, email binding, deleted-ID revalidation, and role separation

- [x] Replace the email-oriented entry screen with separate Student Login and Admin Login choices
- [x] Route Student Login to approved student-ID verification without exposing an email-login option
- [x] Route Admin Login to the administrator authentication flow and keep admin controls role-gated
- [x] Verify responsive front-page role presentation and role-specific access behavior, including mobile review and admin redirect wiring

- [x] Add student profile verification fields for Student ID, Full Name, Branch, and Year
- [x] Require authenticated students to complete and pass the profile form before viewing materials
- [x] Preserve submitted student profile access state across page reloads while rechecking approved identity
- [x] Add tests for profile validation, rejected mismatches, successful profile verification, and materials catalog access

- [x] Replace student profile login with Student-ID-only verification and remove student email/profile entry requirements
- [x] Defer administrator email verification with a real-time 4-digit OTP challenge to a future release per user request
- [x] Defer OTP expiry, reuse prevention, and rate limiting until the administrator OTP feature is re-enabled
- [x] Remove Admin Panel navigation and routes from student accounts
- [x] Add tests for student-ID-only access and student admin-panel denial; OTP tests deferred with the feature

- [x] Keep the public first page as a Student Portal versus Admin Portal selector
- [x] Ensure Admin Portal leads into protected administrator authentication and never exposes the Admin Panel to students

- [x] Configure the temporary Admin Portal password through a secure environment secret
- [x] Add an admin password gate before rendering the Admin Panel
- [x] Keep existing admin role authorization and student denial behavior intact
- [x] Add tests for correct and incorrect admin password handling

- [x] Replace the portal hero copy with a clear centered circular StudyShelf logo mark
- [x] Add distinct visual logo treatments for Student Portal and Admin Portal
- [x] Remove the student email field from the admin student-registration form and import requirements
- [x] Replace subject filter options with CSE, AI&DS, CS, EEE, IT, AI&ML, and ECE
- [x] Verify portal and dashboard responsiveness after the branding changes

- [x] Verify dashboard and Admin Portal password gate at 390px mobile width; cards stack cleanly and controls remain readable

- [x] Add student search above the registered-student list for ID, name, and branch lookup
- [x] Add published-material search for title, subject, and filename lookup
- [x] Collapse registered-student information by default with a View student list control
- [x] Add filtered empty states and verify admin-panel responsiveness

- [x] Add academic year metadata to every uploaded study material
- [x] Replace material semester choices with only 1st semester and 2nd semester
- [x] Add persistent like records bound to a server-trusted Student-ID cookie or authenticated admin identity
- [x] Show like icon and count on material cards, detail pages, and admin material lists
- [x] Add tests for academic-year/two-semester validation, duplicate-like prevention, repeated like/unlike toggles, and public Student-ID cookie issuance

- [x] Apply Obsidian Minimalist noir palette with #0a0a0a background, titanium typography, graphite glass cards, and silver hairline dividers
- [x] Add a subtle monochrome grid texture and consistent dark branded surfaces across portal, dashboard, admin, and document views
- [x] Add interactive 3D perspective tilt with specular sheen to material cards and both portal cards
- [x] Add restrained floating micro-animations to badges, portal buttons, and action pills
- [x] Add a fluid monochrome cursor spotlight that respects touch devices and reduced-motion preferences
- [x] Verify readable contrast, reduced-motion fallback, desktop and mobile responsive behavior, type checks, tests, and production build
