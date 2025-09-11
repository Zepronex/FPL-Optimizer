import { Router } from 'express';
import { z } from 'zod';
import { SquadAnalyzer } from '../lib/squad';
import { AnalysisWeights } from '../types';

const router = Router();

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
  next3Ease: z.number().min(0).max(1).optional()
});

const analyzeRequestSchema = z.object({
  squad: squadSchema,
  weights: weightsSchema.optional()
});

// POST /api/analyze - Analyze squad and get suggestions
router.post('/', async (req, res) => {
  try {
    const { squad, weights } = analyzeRequestSchema.parse(req.body);
    
    // Validate squad formation and constraints
    const validation = SquadAnalyzer.validateSquad(squad);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid squad configuration',
        details: validation.errors
      });
    }
    
    // Use provided weights or defaults
    const analysisWeights: AnalysisWeights = {
      form: weights?.form ?? 0.3,
      xg90: weights?.xg90 ?? 0.25,
      xa90: weights?.xa90 ?? 0.2,
      expMin: weights?.expMin ?? 0.15,
      next3Ease: weights?.next3Ease ?? 0.1
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
    res.status(500).json({
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
      form: 0.3,
      xg90: 0.25,
      xa90: 0.2,
      expMin: 0.15,
      next3Ease: 0.1
    }
  });
});

export { router as analyzeRouter };

