import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { playersRouter } from './routes/players';
import { fixturesRouter } from './routes/fixtures';
import { analyzeRouter } from './routes/analyze';
import { suggestionsRouter } from './routes/suggestions';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/players', playersRouter);
app.use('/api/fixtures', fixturesRouter);
app.use('/api/analyze', analyzeRouter);
app.use('/api/suggestions', suggestionsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Server error occurred
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  // FPL Optimizer API started
});

