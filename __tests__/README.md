# Testing Philosophy

## Repository Tests (`__tests__/repositories/`)
**Purpose**: Verify correctness and invariants of data layer
**Scope**: 
- Repository method correctness
- Business rule enforcement
- Data integrity constraints
- Database transaction safety

## Integration Tests (`__tests__/integration/`)
**Purpose**: Verify end-to-end workflows
**Scope**:
- Multi-repository workflows
- Journal entry and balance calculations
- Account creation and transaction flows
- Data consistency across operations

## UI Testing
**Approach**: UI is validated via the design preview screen
- Visual regression detection
- Component consistency checks
- Theme and accessibility validation
- No separate UI test frameworks needed

## Testing Principles
- **No UI test frameworks** - design preview covers visual validation
- **Repository tests** focus on business logic and data integrity
- **Integration tests** cover realistic user workflows
- **Fast feedback** - tests should run quickly and reliably

## Test Organization
```
__tests__/
├── repositories/          # Data layer correctness
├── integration/           # Workflow validation
└── README.md              # This file
```

## Running Tests
```bash
npm test                    # Run all tests
npm test repositories     # Repository tests only
npm test integration        # Integration tests only
```

## Coverage Goals
- Repository layer: 90%+ coverage of business logic
- Integration layer: Key workflows covered
- UI layer: Validated via design preview
