# Player Name Mapping Documentation

This document explains how the FPL Optimizer handles player name matching and data mapping between different sources.

## Player Name Matching Rules

### Primary Matching Strategy
The system uses fuzzy string matching to find players by name, with the following rules:

1. **Case Insensitive**: All searches are case-insensitive
2. **Partial Matching**: Searches match partial names (e.g., "Salah" matches "Mohamed Salah")
3. **Whitespace Normalization**: Extra spaces are ignored
4. **Accent Handling**: Accented characters are normalized

### Search Examples

| Search Query | Matches |
|--------------|---------|
| "salah" | Mohamed Salah |
| "KDB" | Kevin De Bruyne |
| "haaland" | Erling Haaland |
| "son" | Son Heung-min |
| "kane" | Harry Kane |

## Data Source Mapping

### FPL API Mapping
The system maps data from the official FPL API to our internal format:

```typescript
// FPL API → Internal Format
{
  id: element.id,                    // Player ID
  first_name: element.first_name,    // First name
  second_name: element.second_name,  // Last name
  web_name: element.web_name,        // Display name
  team: element.team,                // Team ID
  element_type: element.element_type, // Position (1-4)
  now_cost: element.now_cost,        // Price (×10)
  form: element.form,                // Form (string)
  status: element.status,            // Availability
  // ... other fields
}
```

### Position Mapping
FPL uses numeric position codes that we map to readable positions:

| FPL Code | Position | Description |
|----------|----------|-------------|
| 1 | GK | Goalkeeper |
| 2 | DEF | Defender |
| 3 | DEF | Defender |
| 4 | DEF | Defender |
| 5 | DEF | Defender |
| 6 | MID | Midfielder |
| 7 | MID | Midfielder |
| 8 | MID | Midfielder |
| 9 | MID | Midfielder |
| 10 | MID | Midfielder |
| 11 | FWD | Forward |
| 12 | FWD | Forward |
| 13 | FWD | Forward |

## Name Override Rules

### Common Nicknames
The system includes common nickname mappings:

```typescript
const NICKNAME_MAPPINGS = {
  'KDB': 'Kevin De Bruyne',
  'KDB': 'K. De Bruyne',
  'Son': 'Son Heung-min',
  'Son': 'Heung-min Son',
  'Kane': 'Harry Kane',
  'Salah': 'Mohamed Salah',
  'Haaland': 'Erling Haaland',
  'Bruno': 'Bruno Fernandes',
  'Rashford': 'Marcus Rashford',
  // ... more mappings
};
```

### Team Name Abbreviations
Team names are mapped to common abbreviations:

```typescript
const TEAM_ABBREVIATIONS = {
  'Arsenal': 'ARS',
  'Aston Villa': 'AVL',
  'Bournemouth': 'BOU',
  'Brentford': 'BRE',
  'Brighton': 'BHA',
  'Chelsea': 'CHE',
  'Crystal Palace': 'CRY',
  'Everton': 'EVE',
  'Fulham': 'FUL',
  'Liverpool': 'LIV',
  'Luton': 'LUT',
  'Manchester City': 'MCI',
  'Manchester United': 'MUN',
  'Newcastle': 'NEW',
  'Nottingham Forest': 'NFO',
  'Sheffield United': 'SHU',
  'Tottenham': 'TOT',
  'West Ham': 'WHU',
  'Wolves': 'WOL'
};
```

## Data Validation Rules

### Player Data Validation
Before processing, player data is validated:

1. **Required Fields**: ID, name, team, position, price must be present
2. **Price Range**: Must be between £4.0m and £15.0m
3. **Position**: Must be valid position code (1-13)
4. **Team**: Must be valid team ID (1-20)
5. **Status**: Must be valid status ('a', 'd', 'i', 's')

### Squad Validation
Squad data is validated against FPL rules:

1. **Formation**: Must have exactly 1 GK, 3-5 DEF, 3-5 MID, 1-3 FWD
2. **Budget**: Total squad value cannot exceed £100.0m
3. **Uniqueness**: No duplicate players allowed
4. **Availability**: All players must be available ('a' status)

## Error Handling

### Common Error Scenarios

1. **Player Not Found**
   - Error: "Player not found"
   - Solution: Try different name variations or check spelling

2. **Invalid Squad Formation**
   - Error: "Invalid formation"
   - Solution: Ensure 1 GK, 3-5 DEF, 3-5 MID, 1-3 FWD

3. **Budget Exceeded**
   - Error: "Total squad value cannot exceed 100.0"
   - Solution: Reduce player prices or bank amount

4. **Duplicate Players**
   - Error: "Cannot have duplicate players"
   - Solution: Remove duplicate player selections

### Fallback Strategies

1. **Name Matching Fallback**: If exact match fails, try fuzzy matching
2. **Data Refresh**: If player data is stale, refresh from FPL API
3. **Default Values**: Use sensible defaults for missing optional data

## API Response Format

### Successful Player Search
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Mohamed Salah",
    "teamShort": "LIV",
    "pos": "MID",
    "price": 13.0,
    "form": 7.2,
    "status": "a"
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Player not found",
  "details": {
    "query": "invalid-player-name",
    "suggestions": ["Mohamed Salah", "Sadio Mané"]
  }
}
```

## Performance Considerations

### Caching Strategy
- Player data is cached for 1 hour to reduce API calls
- Search results are cached for 5 minutes
- Team mappings are cached indefinitely

### Rate Limiting
- FPL API calls are limited to prevent overuse
- Exponential backoff on failures
- Maximum 100 requests per 15 minutes

## Future Enhancements

1. **Fuzzy Matching**: Implement more sophisticated fuzzy matching algorithms
2. **Machine Learning**: Use ML to improve name matching accuracy
3. **User Preferences**: Allow users to save custom name mappings
4. **Auto-complete**: Implement real-time search suggestions
5. **Multi-language**: Support for non-English player names

