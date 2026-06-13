# Implementation Plan: Crypto Panic Button (Coin Escape)

## Overview

This implementation plan breaks down the Crypto Panic Button feature into discrete coding tasks. The system will be built using JavaScript/Node.js with a modular architecture supporting exchange connections, emergency withdrawals, security features, and comprehensive error handling. The implementation follows the design document's component structure and ensures all requirements are met through incremental development.

## Tasks

- [x] 1. Set up project structure and core dependencies
  - Create project directory structure (src/, tests/, config/)
  - Initialize package.json with Node.js 18+ configuration
  - Install core dependencies: ccxt (exchange API), crypto (encryption), axios (HTTP client)
  - Install testing dependencies: jest, fast-check (property-based testing)
  - Set up ESLint and Prettier for code quality
  - Create basic configuration files (.eslintrc, .prettierrc)
  - _Requirements: 13.1, 13.2_

- [x] 2. Implement Security Layer component
  - [x] 2.1 Create encryption service for API credentials
    - Implement AES-256-GCM encryption functions (encryptCredentials, decryptCredentials)
    - Implement PBKDF2 key derivation with 100,000 iterations
    - Create secure credential storage interface
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  
  - [ ]* 2.2 Write property test for encryption round-trip
    - **Property 3: Encryption Round-Trip Property**
    - **Validates: Requirements 8.1, 8.2, 8.4**
  
  - [x] 2.3 Implement audit logging system
    - Create audit log data structures (AuditEntry, OperationLog)
    - Implement HMAC signing for log entries
    - Implement append-only log storage with rotation (10,000 entries / 100MB)
    - Create log query and filtering functions
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9_
  
  - [x] 2.4 Implement user authentication and session management
    - Create password-based authentication system
    - Implement session timeout (15 minutes inactivity)
    - Create session validation function
    - Implement credential memory clearing on session end
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.6, 9.7_
  
  - [ ]* 2.5 Write unit tests for Security Layer
    - Test encryption/decryption with various input sizes
    - Test key derivation consistency
    - Test audit log signing and tamper detection
    - Test session timeout behavior
    - _Requirements: 8.1, 8.2, 8.3, 9.2, 10.6_

- [x] 3. Implement data models and validation
  - [x] 3.1 Create core data model classes
    - Implement Exchange model (id, name, isConnected, connectionStatus, lastSyncTime, supportedAssets)
    - Implement WithdrawalRequest model (exchangeId, asset, amount, destinationAddress, network, memo)
    - Implement WithdrawalPlan model (operationId, createdAt, mode, requests, estimatedDuration, totalValueUSD)
    - Implement ExecutionResults model (operationId, mode, startTime, endTime, overallStatus, individualResults, successCount, failureCount)
    - Implement ApiCredentials model (exchangeId, apiKey, apiSecret, passphrase, permissions, createdAt, expiresAt)
    - Implement AllocationTargets model (targetAddress, assetAllocations)
    - _Requirements: 1.1, 3.1, 3.2, 3.3, 4.1, 4.4_
  
  - [ ]* 3.2 Write property test for allocation consistency
    - **Property 3: Allocation Target Consistency**
    - **Validates: Requirements 3.1, 3.2, 3.3, 28.1, 28.2**
  
  - [x] 3.3 Implement validation functions
    - Create validateWithdrawalRequest function with all validation checks
    - Create validateAllocationTargets function (percentage sum = 100, ranges)
    - Create validateDestinationAddress function for different asset types
    - Create isValidCredentialFormat function
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 3.1, 3.2, 3.3, 3.4, 21.1, 21.4_
  
  - [ ]* 3.4 Write unit tests for validation functions
    - Test validateWithdrawalRequest with valid and invalid inputs
    - Test allocation percentage validation edge cases
    - Test address validation for BTC, ETH, and other assets
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Exchange Manager component
  - [-] 5.1 Create base exchange adapter interface
    - Define ExchangeAdapter interface with standard methods (testConnection, getBalances, executeWithdrawal, getPermissions, getSupportedAssets)
    - Create adapter factory for routing to exchange-specific implementations
    - _Requirements: 13.1, 13.2, 13.3, 13.4_
  
  - [x] 5.2 Implement exchange-specific adapters using ccxt
    - Create BinanceAdapter extending base adapter
    - Create CoinbaseAdapter extending base adapter
    - Create KrakenAdapter extending base adapter
    - Create GenericAdapter for other ccxt-supported exchanges
    - Implement exchange-specific authentication and request signing
    - _Requirements: 1.1, 13.2, 13.3, 13.4, 13.5, 14.4, 14.5_
  
  - [x] 5.3 Implement ExchangeManager class
    - Implement connectExchange function with credential validation and permission checking
    - Implement disconnectExchange function with credential deletion
    - Implement getConnectedExchanges function
    - Implement getExchangeBalances function with API calls
    - Implement getAllBalances function with parallel fetching
    - Implement executeWithdrawal function routing to adapters
    - Implement testConnection function
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.7, 24.1, 24.6, 24.7_
  
  - [ ]* 5.4 Write property test for balance consistency
    - **Property 9: Balance Consistency**
    - **Validates: Requirements 2.7, 11.3, 22.3**
  
  - [ ]* 5.5 Write unit tests for Exchange Manager
    - Test connectExchange with valid/invalid credentials
    - Test permission verification logic
    - Test parallel balance fetching
    - Test adapter routing
    - Mock exchange API responses
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1_

- [ ] 6. Implement rate limiting and network security
  - [ ] 6.1 Create rate limiting manager
    - Implement per-exchange rate limit tracking
    - Implement request queuing when approaching limits
    - Implement exponential backoff for rate limit errors
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_
  
  - [ ] 6.2 Implement network security features
    - Configure TLS 1.3 for all exchange connections
    - Implement SSL certificate verification
    - Implement request signing per exchange requirements
    - Add nonce/timestamp to prevent replay attacks
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_
  
  - [ ]* 6.3 Write unit tests for rate limiting
    - Test rate limit tracking and queuing
    - Test exponential backoff behavior
    - Test request throttling
    - _Requirements: 15.1, 15.2, 15.3_

- [ ] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Implement Withdrawal Engine component
  - [ ] 8.1 Implement withdrawal plan builder
    - Create buildWithdrawalPlan function implementing the algorithm from design
    - Calculate total value by asset across exchanges
    - Apply allocation percentages and minimum thresholds
    - Distribute withdrawals proportionally across exchanges
    - Generate unique operation IDs
    - Calculate estimated duration and total USD value
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 28.1, 28.3, 28.4, 28.5, 28.6_
  
  - [ ]* 8.2 Write property test for plan completeness
    - **Property 2: Plan Completeness**
    - **Validates: Requirements 4.6, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6**
  
  - [ ] 8.3 Implement simulation engine
    - Create simulateWithdrawal function implementing the algorithm from design
    - Validate each request without executing
    - Generate simulated transaction IDs with "SIMULATED-" prefix
    - Return simulation results with success/failure indicators
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_
  
  - [ ]* 8.4 Write property test for dry run safety
    - **Property 5: Dry Run Safety**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
  
  - [ ] 8.5 Implement parallel withdrawal execution
    - Create executeWithdrawalPlan function implementing the algorithm from design
    - Execute withdrawal requests in parallel using Promise.all
    - Implement 30-second timeout for entire operation
    - Isolate failures so one doesn't affect others
    - Aggregate results and calculate success/failure counts
    - Determine overall status (SUCCESS, FAILED, PARTIAL_SUCCESS)
    - _Requirements: 6.4, 6.5, 6.6, 6.9, 6.10, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_
  
  - [ ]* 8.6 Write property test for execution isolation
    - **Property 8: Parallel Execution Isolation**
    - **Validates: Requirements 7.1, 7.2, 7.3, 6.6**
  
  - [ ]* 8.7 Write property test for results completeness
    - **Property 4: Execution Results Completeness**
    - **Validates: Requirements 7.8, 12.4, 12.7**
  
  - [ ] 8.8 Implement main withdrawal orchestration
    - Create initiateEmergencyWithdrawal function implementing the algorithm from design
    - Validate user session
    - Get connected exchanges and balances
    - Build withdrawal plan
    - Execute based on mode (DRY_RUN or REAL_WITHDRAWAL)
    - Log operation to audit trail
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 9.3, 20.1, 20.3, 20.4_
  
  - [ ]* 8.9 Write property test for withdrawal atomicity
    - **Property 1: Withdrawal Atomicity per Exchange**
    - **Validates: Requirements 6.7, 6.8, 12.1, 12.2**
  
  - [ ]* 8.10 Write unit tests for Withdrawal Engine
    - Test buildWithdrawalPlan with various balance scenarios
    - Test minimum amount filtering
    - Test proportional distribution
    - Test parallel execution with mocked exchanges
    - Test timeout handling
    - _Requirements: 4.1, 4.2, 4.3, 6.4, 7.3_

- [ ] 9. Implement error handling and recovery
  - [ ] 9.1 Create error handling utilities
    - Implement error classification (network, rate limit, validation, exchange maintenance)
    - Create user-friendly error message generator
    - Implement error logging to audit trail
    - _Requirements: 1.5, 6.8, 11.7, 19.6_
  
  - [ ] 9.2 Implement retry logic
    - Create retry mechanism for rate limit errors with exponential backoff
    - Implement PENDING status for timeouts
    - Create buildRetryPlan function for failed withdrawals
    - Implement logic to skip exchanges in maintenance mode
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_
  
  - [ ] 9.3 Implement graceful degradation
    - Exclude unavailable exchanges from withdrawal plans
    - Redistribute amounts among available exchanges
    - Notify user of excluded exchanges
    - Handle all-exchanges-unavailable scenario
    - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6_
  
  - [ ]* 9.4 Write unit tests for error handling
    - Test error classification and message generation
    - Test retry logic with various error types
    - Test graceful degradation scenarios
    - _Requirements: 16.1, 16.2, 16.3, 27.1, 27.3_

- [ ] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Implement transaction tracking and history
  - [ ] 11.1 Create transaction result tracking
    - Implement result recording for SUCCESS, FAILED, PENDING statuses
    - Record transaction IDs, timestamps, error messages
    - Record exchange ID, asset, amount for each result
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_
  
  - [ ] 11.2 Implement withdrawal history storage
    - Create withdrawal history data structure
    - Implement history persistence to local storage
    - Create query functions with filtering (date, mode, status)
    - Implement export to CSV/JSON
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7_
  
  - [ ]* 11.3 Write unit tests for transaction tracking
    - Test result recording for all status types
    - Test history filtering and querying
    - Test export functionality
    - _Requirements: 12.1, 12.2, 12.3, 25.4, 25.5, 25.6_

- [ ] 12. Implement configuration management
  - [ ] 12.1 Create configuration storage
    - Implement allocation targets persistence
    - Implement destination address storage with validation
    - Implement execution mode persistence
    - Implement configuration export/import for backup
    - _Requirements: 3.6, 18.1, 18.2, 18.3, 18.4, 18.6, 18.7, 20.5, 21.7_
  
  - [ ] 12.2 Implement destination address management
    - Create address whitelist functionality
    - Implement multi-asset address support
    - Implement network selection for multi-network assets
    - Add new address warning system
    - _Requirements: 21.1, 21.2, 21.3, 21.5, 21.6_
  
  - [ ]* 12.3 Write unit tests for configuration management
    - Test configuration persistence and restoration
    - Test address validation and whitelist
    - Test export/import functionality
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 21.1, 21.2_

- [ ] 13. Implement anomaly detection and alerts
  - [ ] 13.1 Create anomaly detection system
    - Implement failed authentication tracking and alerting
    - Implement new destination address detection
    - Implement withdrawal amount anomaly detection (vs historical average)
    - Implement rapid activation detection
    - Create configurable alert thresholds
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7_
  
  - [ ]* 13.2 Write unit tests for anomaly detection
    - Test authentication failure tracking
    - Test anomaly threshold calculations
    - Test alert generation
    - _Requirements: 26.1, 26.2, 26.3, 26.4_

- [ ] 14. Implement UI Controller component
  - [ ] 14.1 Create UI state management
    - Implement state management for exchange status display
    - Implement state management for asset allocation display
    - Implement state management for withdrawal progress
    - Implement state management for results display
    - _Requirements: 19.1, 19.2, 19.3, 19.4_
  
  - [ ] 14.2 Implement panic button interaction handler
    - Create handlePanicButtonPress function
    - Implement swipe confirmation logic with gesture tracking
    - Implement 10-second timeout for swipe confirmation
    - Implement cancellation on incomplete swipe
    - Provide visual feedback for swipe progress
    - _Requirements: 6.1, 6.2, 6.3, 19.7, 29.1, 29.2, 29.3, 29.4, 29.5_
  
  - [ ] 14.3 Implement execution mode selection UI
    - Create mode selection interface (DRY_RUN / REAL_WITHDRAWAL)
    - Display warning when switching to REAL_WITHDRAWAL
    - Show current mode indicator
    - Require re-authentication for mode switch
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.6_
  
  - [ ] 14.4 Implement real-time progress display
    - Create progress update streaming during withdrawal
    - Display individual exchange progress
    - Update success/failure counts in real-time
    - Ensure UI responsiveness (<100ms for interactions)
    - _Requirements: 17.6, 19.3, 19.5_
  
  - [ ] 14.5 Implement results display
    - Display overall status and summary (success/failure counts)
    - Display individual results with transaction IDs
    - Show success indicators (✓) and failure indicators (✗)
    - Display error messages for failed withdrawals
    - _Requirements: 6.9, 12.5, 12.6, 19.4_
  
  - [ ]* 14.6 Write unit tests for UI Controller
    - Test panic button interaction flow
    - Test swipe confirmation logic
    - Test mode selection and warnings
    - Test progress update handling
    - _Requirements: 6.1, 6.2, 6.3, 20.1, 20.2, 29.1, 29.2_

- [ ] 15. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 16. Implement connection status monitoring
  - [ ] 16.1 Create connection health checker
    - Implement periodic connection testing (every 5 minutes)
    - Update connection status (CONNECTED, DISCONNECTED, ERROR)
    - Track last successful sync time
    - Implement manual connection test function
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.7_
  
  - [ ]* 16.2 Write unit tests for connection monitoring
    - Test periodic health checks
    - Test status updates on connection changes
    - Test manual connection testing
    - _Requirements: 24.1, 24.2, 24.3, 24.6_

- [ ] 17. Implement system health monitoring
  - [ ] 17.1 Create system health monitor
    - Implement memory usage tracking
    - Track connected exchange count
    - Track last balance refresh time
    - Track audit log size
    - Create health check function for all components
    - Implement alerts for memory >750MB and log size >90MB
    - _Requirements: 30.1, 30.2, 30.3, 30.4, 30.5, 30.6, 30.7_
  
  - [ ]* 17.2 Write unit tests for health monitoring
    - Test memory usage tracking
    - Test alert threshold triggering
    - Test health check function
    - _Requirements: 30.1, 30.5, 30.6, 30.7_

- [ ] 18. Implement performance optimizations
  - [ ] 18.1 Optimize balance fetching
    - Implement 30-second balance caching
    - Implement parallel API calls with Promise.all
    - Set 5-second timeout per exchange
    - Display cached balances with staleness indicator when exchange unavailable
    - _Requirements: 2.1, 2.2, 2.5, 2.6, 17.2_
  
  - [ ] 18.2 Optimize credential handling
    - Implement in-memory credential caching during session
    - Clear credential cache on session timeout
    - Minimize decryption operations
    - _Requirements: 8.6, 9.2_
  
  - [ ] 18.3 Implement connection pooling
    - Configure persistent HTTP connections for exchange APIs
    - Implement connection keep-alive
    - Set pool size to 5 connections per exchange
    - _Requirements: 17.1, 17.2, 17.3, 17.4_
  
  - [ ]* 18.4 Write performance tests
    - Test panic button response time (<5 seconds)
    - Test balance fetch time (<3 seconds)
    - Test plan generation time (<500ms)
    - Test memory footprint (<500MB)
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.7_

- [ ] 19. Implement multi-asset support
  - [ ] 19.1 Create asset-specific handlers
    - Implement BTC withdrawal support
    - Implement ETH withdrawal support
    - Implement major altcoin support (SOL, ADA, DOT)
    - Implement stablecoin support (USDT, USDC, DAI)
    - Handle different decimal precision per asset
    - Validate exchange-specific minimum withdrawal amounts
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23.7_
  
  - [ ]* 19.2 Write unit tests for multi-asset support
    - Test asset-specific validation
    - Test decimal precision handling
    - Test minimum amount validation per asset
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.6, 23.7_

- [ ] 20. Implement transaction fee handling
  - [ ] 20.1 Create fee estimation and tracking
    - Implement fee estimation for withdrawal plans
    - Record actual fees charged by exchanges
    - Account for fees in balance calculations
    - Display fee information to user
    - Ensure withdrawal + fees <= available balance
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5_
  
  - [ ]* 20.2 Write unit tests for fee handling
    - Test fee estimation
    - Test balance calculations including fees
    - Test fee recording
    - _Requirements: 22.1, 22.2, 22.3, 22.5_

- [ ] 21. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 22. Integration and wiring
  - [ ] 22.1 Wire all components together
    - Connect Security Layer to Exchange Manager for credential management
    - Connect Exchange Manager to Withdrawal Engine for balance and execution
    - Connect Withdrawal Engine to UI Controller for user interactions
    - Connect all components to audit logging
    - Implement dependency injection for testability
    - _Requirements: All requirements_
  
  - [ ] 22.2 Create main application entry point
    - Initialize all components
    - Set up authentication flow
    - Restore persisted configuration and connections
    - Start connection health monitoring
    - Start system health monitoring
    - _Requirements: 9.1, 18.3, 18.4, 24.1, 30.7_
  
  - [ ]* 22.3 Write integration tests
    - Test end-to-end dry run flow
    - Test end-to-end withdrawal flow (with mocked exchanges)
    - Test error recovery scenarios
    - Test multi-exchange parallel execution
    - _Requirements: 5.1, 5.2, 5.3, 6.1, 6.2, 6.4, 7.1, 7.2_

- [ ] 23. Final testing and validation
  - [ ]* 23.1 Run all property-based tests
    - Execute all property tests with 1000+ iterations
    - Verify all correctness properties hold
    - Document any edge cases discovered
    - _Requirements: All correctness properties_
  
  - [ ]* 23.2 Run comprehensive test suite
    - Execute all unit tests
    - Execute all integration tests
    - Verify code coverage >80% for core logic
    - Verify 100% coverage for security functions
    - _Requirements: All requirements_
  
  - [ ]* 23.3 Perform manual testing
    - Test with exchange sandbox/testnet APIs
    - Verify UI responsiveness and feedback
    - Test error scenarios and recovery
    - Validate audit logging completeness
    - _Requirements: 1.1, 5.1, 6.1, 10.1, 19.5_

- [ ] 24. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Implementation uses JavaScript/Node.js as selected by the user
- Property tests validate universal correctness properties from the design
- Unit tests validate specific examples and edge cases
- Integration tests verify end-to-end workflows
- Checkpoints ensure incremental validation throughout development
- All security-critical functions (encryption, validation) require 100% test coverage
- Exchange API calls should be mocked in tests to avoid rate limits and real transactions
