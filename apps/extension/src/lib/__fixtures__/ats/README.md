# Deterministic ATS extraction fixtures

These are authored, recorded-like HTML fixtures based on common public ATS DOM conventions, not network captures or snapshots of named employers. Acme is fictional. They deliberately include realistic nested posting content, form markup, placeholder choices, related roles, hidden controls, and footer links. No live ATS availability or current production markup is claimed.

The corpus covers Greenhouse hosted, Lever posting and application-only routes, Ashby, Workday, SmartRecruiters, LinkedIn job views, and generic careers pages. Embedded Greenhouse/frame routing is covered separately by the frame integration tests.

The separate `public-*.html` fixtures are minimized actual public-page captures, with URLs, HTTP status and capture dates in `public-sources.json`. Non-content scripts, styles, media and tracking attributes were removed; form structure and relevant attributes were retained. Ashby application markup was captured after opening its application tab. The PostHog URL returned a general careers listing, deliberately retained as a no-description negative case. These fixtures are source snapshots, not claims that the vacancies remain open.

The Ashby and Lever posting fixtures had invalid JSON-LD strings containing literal line breaks. Those line breaks were removed without changing the remaining bytes, restoring parseable employer and description metadata. The original network responses are not retained; byte counts in `public-sources.json` describe the captured responses, not these minimized fixtures.

Workday public pages and CXS endpoints on three tenants returned HTTP 521 during capture on November 14, 2026; the browser also displayed a Workday error page. Workday therefore has authored deterministic coverage only, not a successful live-page capture.
