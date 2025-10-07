import { Router } from 'express';
import { z } from 'zod';
import { SquadAnalyzer } from '../lib/squad';
import { ScoringService } from '../lib/scoring';
import { AnalysisWeights } from '../types';

const router: Router = Router();

// Validation schemas
const squadSlotSchema = z.object({
  id: z.number().int().positive(),
  pos: z.enum(['GK', 'DEF', 'MID', 'FWD']),
  price: z.number().positive().max(15)
});

const squadSchema = z.object({
  startingXI: z.array(squadSlotSchema).length(11),
  bench: z.array(squadSlotSchema).length(4),
  bank: z.number().min(0).max(100)
});

const weightsSchema = z.object({
  form: z.number().min(0).max(1).optional(),
  xg90: z.number().min(0).max(1).optional(),
  xa90: z.number().min(0).max(1).optional(),
  expMin: z.number().min(0).max(1).optional(),
  next3Ease: z.number().min(0).max(1).optional(),
  avgPoints: z.number().min(0).max(1).optional(),
  value: z.number().min(0).max(1).optional(),
  ownership: z.number().min(0).max(1).optional()
});

const analyzeRequestSchema = z.object({
  squad: squadSchema,
  weights: weightsSchema.optional()
});

// POST /api/analyze - Analyze squad and get suggestions
router.post('/', async (req, res) => {
  try {
    const { squad, weights } = analyzeRequestSchema.parse(req.body);
    
    // Validate squad formation and constraints (no budget limits for analysis)
    const validation = SquadAnalyzer.validateSquadForAnalysis(squad);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid squad configuration',
        details: validation.errors
      });
    }
    
    // Use provided weights or defaults
    const analysisWeights: AnalysisWeights = {
      form: weights?.form ?? 0.2,
      xg90: weights?.xg90 ?? 0.15,
      xa90: weights?.xa90 ?? 0.15,
      expMin: weights?.expMin ?? 0.15,
      next3Ease: weights?.next3Ease ?? 0.1,
      avgPoints: weights?.avgPoints ?? 0.15,
      value: weights?.value ?? 0.05,
      ownership: weights?.ownership ?? 0.05
    };
    
    // Normalize weights to sum to 1
    const totalWeight = Object.values(analysisWeights).reduce((sum, w) => sum + w, 0);
    if (totalWeight > 0) {
      Object.keys(analysisWeights).forEach(key => {
        analysisWeights[key as keyof AnalysisWeights] /= totalWeight;
      });
    }
    
    // Perform analysis
    const analysis = await SquadAnalyzer.analyzeSquad(squad, analysisWeights);
    
    res.json({
      success: true,
      data: {
        ...analysis,
        weights: analysisWeights,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      });
    }
    
    // Error analyzing squad
    return res.status(500).json({
      success: false,
      error: 'Failed to analyze squad'
    });
  }
});

// POST /api/analyze/validate - Validate squad without analysis
router.post('/validate', async (req, res) => {
  try {
    const { squad } = z.object({ squad: squadSchema }).parse(req.body);
    
    const validation = SquadAnalyzer.validateSquad(squad);
    
    res.json({
      success: true,
      data: {
        valid: validation.valid,
        errors: validation.errors
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      });
    }
    
    // Error validating squad
    res.status(500).json({
      success: false,
      error: 'Failed to validate squad'
    });
  }
});

// GET /api/analyze/weights - Get default weights
router.get('/weights', (req, res) => {
  res.json({
    success: true,
    data: {
      form: 0.2,
      xg90: 0.15,
      xa90: 0.15,
      expMin: 0.15,
      next3Ease: 0.1,
      avgPoints: 0.15,
      value: 0.05,
      ownership: 0.05
    }
  });
});

// GET /api/analyze/presets - Get weight presets
router.get('/presets', (req, res) => {
  res.json({
    success: true,
    data: ScoringService.getWeightPresets()
  });
});

export { router as analyzeRouter };

