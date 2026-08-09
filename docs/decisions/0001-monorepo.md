# ADR 0001: New local-first monorepo

Status: accepted

The product is implemented as an npm workspace containing a framework-free TypeScript web
application, explicit domain packages, and a local Python processor. Third-party music and
ML projects are consumed behind adapters rather than copied into the repository.

