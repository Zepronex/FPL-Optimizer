import express from 'express';
import axios from 'axios';
import { OptimizeRequest, OptimizeResponse } from '../types';

export const optimizeRouter: express.Router = express.Router();

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:3002';

optimizeRouter.post('/', async (req, res) => {
  const payload = req.body as OptimizeRequest;

  try {
    const response = await axios.post<OptimizeResponse>(`${ML_SERVICE_URL}/optimize/transfers`, payload, {
      timeout: 15000,
    });

    res.json(response.data);
  } catch (error: any) {
    const status = error?.response?.status || 500;
    res.status(status).json({
      error: 'Failed to optimize transfers',
      details: error?.response?.data || error?.message,
    });
  }
});

