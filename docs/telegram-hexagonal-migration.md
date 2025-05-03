# Migration to Hexagonal Architecture: Telegram Bot Implementation

This document describes the migration process for the MidasTS Telegram bot integration from a traditional service-based approach to a hexagonal architecture implementation.

## Overview

The migration followed these key steps:

1. Define a `TelegramServicePort` interface in the ports layer
2. Create a `TelegramAdapter` implementing that port
3. Update the runner script to use dependency injection
4. Simplify and organize the code to follow hexagonal architecture principles

## Why Hexagonal Architecture?

Hexagonal architecture (also known as Ports and Adapters pattern) provides several benefits:

- **Separation of concerns**: Core business logic is separated from external systems
- **Testability**: Components can be tested in isolation with mocks
- **Flexibility**: Implementations can be swapped without changing business logic
- **Dependency inversion**: Dependencies point inward toward the core domain

## Implementation Details

### 1. Port Definition

We created a `TelegramServicePort` interface that defines the contract for Telegram integration:

```typescript
// src/ports/inbound/telegram-service-port.ts
export interface TelegramServicePort {
  start(): Promise<void>;
  stop(reason?: string): Promise<void>;
  sendNotificationToAll(message: string): Promise<void>;
  sendTradingSignal(symbol: string, signal: any): Promise<void>;
  sendOrderNotification(order: any): Promise<void>;
  isRunning(): boolean;
}
```

### 2. Adapter Implementation

We implemented a `TelegramAdapter` that adheres to the `TelegramServicePort` interface:

```typescript
// src/adapters/inbound/telegram-adapter-simple.ts
export class TelegramAdapter implements TelegramServicePort {
  constructor(dependencies: TelegramAdapterDependencies) {
    // Initialize with injected dependencies
  }
  
  // Implement all methods from the port interface
}
```

Key improvements:
- Dependencies are injected through the constructor
- Implementation details are encapsulated
- No direct coupling to other services
- Clean separation between interface and implementation

### 3. Updated Runner Script

The new runner script now:
- Injects all dependencies explicitly
- Uses the adapter through its port interface
- Has better error handling and setup sequencing

### 4. Simplified Version

We provided a simplified version (`telegram-adapter-simple.ts`) that:
- Focuses on the core functionality required by the port
- Removes complex scene handling to clarify the architecture
- Shows a cleaner way to implement the pattern

## Migration Steps for Other Components

To migrate other services to hexagonal architecture:

1. **Identify ports**: Define clear interfaces for the service
2. **Create adapters**: Implement these interfaces with adapters
3. **Inject dependencies**: Use constructor injection instead of direct imports
4. **Refactor runners**: Update startup scripts to wire everything together

## Benefits of the Migration

The new implementation:

- Better follows MidasTS architectural standards
- Is more testable with clear dependency injection
- Separates Telegram-specific code from business logic
- Provides a cleaner, more maintainable structure

## Usage Examples

### Original approach:

```typescript
import { TelegramService } from './services/telegram';

const telegramService = new TelegramService();
await telegramService.start();
```

### New hexagonal approach:

```typescript
import { TelegramAdapter } from './adapters/inbound/telegram-adapter';
import { binanceService } from './services/binance';
// ... other imports

const dependencies = {
  binanceService,
  deepSeekService,
  // ... other dependencies
};

const telegramAdapter = new TelegramAdapter(dependencies);
await telegramAdapter.start();
```

## Future Improvements

- Create proper domain entities for trading signals, orders, etc.
- Add more specific port methods for different notification types
- Implement proper event handling for communication between services
- Improve error handling and circuit breaking for external dependencies

## Testing

The new architecture makes testing easier:

```typescript
// Example test
it('should send notifications to authorized users', async () => {
  // Create mock dependencies
  const mockDependencies = {
    binanceService: { /* mock implementation */ },
    // ... other mocks
  };
  
  // Create adapter with mocks
  const adapter = new TelegramAdapter(mockDependencies);
  
  // Test the adapter's functionality
  await adapter.sendNotificationToAll('Test message');
  
  // Assert expected behavior
});
