# Analysis Weights Documentation

The FPL Optimizer uses configurable weights to score players based on different metrics. Understanding these weights helps you customize the analysis to match your FPL strategy.

## Weight Categories

### 1. Form (Default: 30%)
**What it measures**: Recent performance and consistency
- Based on FPL's official form metric (0-10 scale)
- Reflects points per game over the last 5 gameweeks
- Higher form indicates better recent performance

**When to increase**: If you prefer players with proven recent form
**When to decrease**: If you're looking for differentials or value picks

### 2. xG/90 (Default: 25%)
**What it measures**: Expected goals per 90 minutes
- Advanced metric predicting goal-scoring likelihood
- Based on shot quality and positioning
- Higher xG/90 indicates better goal-scoring potential

**When to increase**: For attacking players (forwards, attacking midfielders)
**When to decrease**: For defensive players or budget options

### 3. xA/90 (Default: 20%)
**What it measures**: Expected assists per 90 minutes
- Advanced metric predicting assist likelihood
- Based on pass quality and teammate positioning
- Higher xA/90 indicates better creative potential

**When to increase**: For creative players and playmakers
**When to decrease**: For goal-scoring focused players

### 4. Expected Minutes (Default: 15%)
**What it measures**: Likelihood of playing time
- Based on recent minutes, rotation risk, and injury status
- Higher expected minutes = more reliable for points
- Critical for captaincy and starting XI decisions

**When to increase**: For premium players or captaincy candidates
**When to decrease**: For bench players or rotation risks

### 5. Next 3 Fixtures (Default: 10%)
**What it measures**: Difficulty of upcoming matches
- Based on opponent strength and home/away advantage
- Lower difficulty = easier fixtures = more points potential
- Inverted scale (1=easy, 5=hard)

**When to increase**: For short-term planning or fixture runs
**When to decrease**: For long-term squad building

## Weight Presets

### Form Focus (40% Form, 30% xG, 20% xA, 10% Minutes, 0% Fixtures)
- Prioritizes players with proven recent form
- Good for: Consistent performers, established players
- Risk: May miss emerging talents or value picks

### Attack Focus (20% Form, 30% xG, 30% xA, 10% Minutes, 10% Fixtures)
- Emphasizes goal and assist potential
- Good for: Attacking players, differential picks
- Risk: May overlook defensive contributions

### Balanced (20% each)
- Equal weight to all metrics
- Good for: General squad building, new managers
- Risk: May not optimize for specific strategies

### Fixture Focus (10% Form, 20% xG, 20% xA, 20% Minutes, 30% Fixtures)
- Prioritizes upcoming fixture difficulty
- Good for: Short-term planning, fixture runs
- Risk: May sacrifice long-term value

## Customizing Weights

### For Different Player Types

**Goalkeepers & Defenders**:
- Increase: Expected Minutes, Next 3 Fixtures
- Decrease: xG/90, xA/90

**Midfielders**:
- Increase: xA/90, Expected Minutes
- Decrease: xG/90 (unless attacking midfielders)

**Forwards**:
- Increase: xG/90, Form
- Decrease: xA/90

### For Different Strategies

**Template Team**:
- Increase: Form, Expected Minutes
- Decrease: xG/90, xA/90 (focus on reliability)

**Differential Hunting**:
- Increase: xG/90, xA/90
- Decrease: Form (look for emerging players)

**Fixture Planning**:
- Increase: Next 3 Fixtures
- Decrease: Form (short-term focus)

## Best Practices

1. **Normalize Weights**: Always ensure weights sum to 1.0 for consistent scoring
2. **Test Different Configurations**: Try various weight combinations to see how they affect your squad
3. **Consider Your Strategy**: Align weights with your FPL approach (template vs differential)
4. **Monitor Results**: Track how different weight configurations perform over time
5. **Seasonal Adjustments**: Adjust weights based on current FPL trends and meta

## Technical Notes

- Weights are automatically saved to your browser's localStorage
- All metrics are normalized to a 0-10 scale for consistent comparison
- The scoring algorithm uses weighted averages of normalized metrics
- Weights can be adjusted in real-time and immediately affect analysis results

