# Security Baseline Checklist

This document provides a checklist and recommendations for securing the Fitnesslady project, focusing on Content Security Policy (CSP), security headers, and deployment best practices for GitHub Pages and Cloudflare.

## 1. Content Security Policy (CSP)

- Use a restrictive CSP with `report-only` for monitoring before enforcement.
- Include `script-src`, `style-src`, `img-src`, and other directives tailored to your app needs.
- Use nonces or hashes for inline scripts/styles when possible.
- Example `report-only` meta tag:

  ```html
  <meta http-equiv="Content-Security-Policy-Report-Only" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; report-uri /csp-report-endpoint">
  ```

## 2. Referrer-Policy

- Set `referrer-policy` to control information sent in the Referer header.
- Recommended value: `strict-origin-when-cross-origin` or `no-referrer` depending on privacy needs.
- Example meta tag:

  ```html
  <meta name="referrer" content="strict-origin-when-cross-origin">
  ```

## 3. Security Headers for GitHub Pages + Cloudflare

- GitHub Pages does not allow custom HTTP headers directly; use meta tags for CSP, Referrer-Policy, etc.
- Cloudflare Workers or Page Rules can add security headers like `Strict-Transport-Security`, `X-Frame-Options`, and others.
- Recommended headers:

  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Content-Security-Policy` or `Content-Security-Policy-Report-Only`

## 4. JavaScript Best Practices

- Avoid using `innerHTML` with untrusted content to prevent XSS.
- Use `textContent` or properly escape strings when inserting dynamic content.
- Handle fetch errors and provide user feedback rather than silent failure.

## 5. Monitoring and Reporting

- Set up a CSP report endpoint to collect violation reports.
- Monitor error logs and user feedback to improve security settings.

---

By following this checklist, you can improve the security posture of your site when using GitHub Pages and Cloudflare.
