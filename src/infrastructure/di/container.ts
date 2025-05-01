import 'reflect-metadata';
import { container } from 'tsyringe';

// Import ports (interfaces)
import { ExchangePort } from '../../ports/exchange';

// Import implementations (temporarily commented out until we reorganize the code)
// import { BinanceAdapter } from '../../adapters/outbound/binance';

/**
 * This file sets up the dependency injection container for the application.
 * Each port (interface) is registered with its concrete implementation.
 * 
 * This allows services to depend on abstract interfaces rather than concrete implementations,
 * following the Dependency Inversion Principle of SOLID.
 */

// Register bindings - these will be uncommented and properly configured as we reorganize the code
// container.register<ExchangePort>('ExchangePort', { 
//   useClass: BinanceAdapter 
// });

// Example of registering a value instead of a class
// container.register('ApiKey', { useValue: process.env.API_KEY });

// Example of registering a factory function
// container.register('Logger', {
//   useFactory: (dependencyContainer) => {
//     const environment = dependencyContainer.resolve('Environment');
//     return environment === 'production' 
//       ? new ProductionLogger() 
//       : new DevelopmentLogger();
//   }
// });

export { container };
