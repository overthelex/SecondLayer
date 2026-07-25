# SecondLayer Mobile

Mobile client for the SecondLayer legal tech platform, built with Flutter.

## Stack

- **Flutter** (Dart)
- **Riverpod** — state management
- **Go Router** — navigation

## Getting Started

```bash
# Install Flutter dependencies
flutter pub get

# Copy environment config
cp .env.example .env

# Run on connected device or emulator
flutter run
```

## Environment Variables

See [.env.example](.env.example) for configuration.

- `API_URL` — Backend API base URL

## Project Structure

```
lib/
├── features/       # Feature modules (consultation, documents, etc.)
│   ├── data/       # Repositories, data sources
│   ├── domain/     # State notifiers, business logic
│   └── presentation/ # Screens and widgets
├── navigation/     # Router configuration
└── shared/         # Common utilities and widgets
```
