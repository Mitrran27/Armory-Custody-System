import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import { authRouter } from './routes/auth.routes.js';
import { guardAuthRouter } from './routes/guardAuth.routes.js';
import { guardSelfRouter } from './routes/guardSelf.routes.js';
import { usersRouter } from './routes/users.routes.js';
import { guardsRouter } from './routes/guards.routes.js';
import { firearmsRouter } from './routes/firearms.routes.js';
import { zonesRouter } from './routes/zones.routes.js';
import { camerasRouter } from './routes/cameras.routes.js';
import { facilityRouter } from './routes/facility.routes.js';
import { auditRouter } from './routes/audit.routes.js';
import { accessRequestsRouter } from './routes/accessRequests.routes.js';
import { rolesRouter } from './routes/roles.routes.js';
import { notificationsRouter } from './routes/notifications.routes.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

const allowedOrigins = (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export const app = express();

app.use(helmet());
app.use(
	cors({
		origin: allowedOrigins.length ? allowedOrigins : true,
		credentials: true
	})
);
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));

app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRouter);
app.use('/api/guard-auth', guardAuthRouter);
app.use('/api/guard', guardSelfRouter);
app.use('/api/users', usersRouter);
app.use('/api/guards', guardsRouter);
app.use('/api/firearms', firearmsRouter);
app.use('/api/zones', zonesRouter);
app.use('/api/cameras', camerasRouter);
app.use('/api/facility', facilityRouter);
app.use('/api/audit', auditRouter);
app.use('/api/access-requests', accessRequestsRouter);
app.use('/api/roles', rolesRouter);
app.use('/api/notifications', notificationsRouter);

app.use(notFoundHandler);
app.use(errorHandler);
