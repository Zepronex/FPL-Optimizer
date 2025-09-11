import { Router } from 'express';
import { FPLDataFetcher } from '../lib/fetchers/fpl';

const router = Router();

// GET /api/fixtures - Get all fixtures
router.get('/', async (req, res) => {
  try {
    const fixtures = await FPLDataFetcher.getFixtures();
    res.json({
      success: true,
      data: fixtures,
      count: fixtures.length
    });
  } catch (error) {
    console.error('Error fetching fixtures:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch fixtures'
    });
  }
});

// GET /api/fixtures/gameweek/:gw - Get fixtures for specific gameweek
router.get('/gameweek/:gw', async (req, res) => {
  try {
    const gameweek = parseInt(req.params.gw);
    if (isNaN(gameweek) || gameweek < 1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid gameweek number'
      });
    }
    
    const fixtures = await FPLDataFetcher.getFixtures();
    const gameweekFixtures = fixtures.filter(f => f.event === gameweek);
    
    res.json({
      success: true,
      data: gameweekFixtures,
      count: gameweekFixtures.length
    });
  } catch (error) {
    console.error('Error fetching gameweek fixtures:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch gameweek fixtures'
    });
  }
});

// GET /api/fixtures/team/:teamId - Get fixtures for specific team
router.get('/team/:teamId', async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    if (isNaN(teamId) || teamId < 1 || teamId > 20) {
      return res.status(400).json({
        success: false,
        error: 'Invalid team ID'
      });
    }
    
    const fixtures = await FPLDataFetcher.getFixtures();
    const teamFixtures = fixtures.filter(f => f.team_h === teamId || f.team_a === teamId);
    
    res.json({
      success: true,
      data: teamFixtures,
      count: teamFixtures.length
    });
  } catch (error) {
    console.error('Error fetching team fixtures:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch team fixtures'
    });
  }
});

// GET /api/fixtures/current - Get current gameweek
router.get('/current', async (req, res) => {
  try {
    const currentGw = await FPLDataFetcher.getCurrentGameweek();
    res.json({
      success: true,
      data: { currentGameweek: currentGw }
    });
  } catch (error) {
    console.error('Error fetching current gameweek:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch current gameweek'
    });
  }
});

export { router as fixturesRouter };

