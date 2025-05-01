# API Reference

Information-oriented documentation for MidasTS that provides comprehensive technical details about the API.

## API Documentation

The full API documentation is automatically generated from source code using TypeDoc and can be accessed by opening the `index.html` file in this directory.

To regenerate the API documentation, run:

```bash
npm run docs:generate
```

## Structure

The API reference is organized by component types:

- **Core** - Domain entities, value objects, and application services
- **Services** - Implementation of core business logic
- **Adapters** - Integration with external systems
- **Utils** - Utility functions and helpers

## API Stability

Components are marked according to their stability status:

- **Stable** - API is stable and won't change without major version bump
- **Beta** - API may change in minor versions
- **Experimental** - API may change in any release

## Exit Codes

The following exit codes are used by the CLI commands:

| Code | Meaning                       |
|------|-------------------------------|
| 0    | Success                       |
| 1    | General error                 |
| 2    | Configuration error           |
| 3    | API connection error          |
| 4    | Database error                |
| 5    | Permission/authentication error |

## Environment Variables

See the `.env.example` file for a complete list of supported environment variables.
