import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import pg from 'pg'

const { Pool } = pg
const app = express()
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const port = Number(process.env.PORT || 3001)

app.use(cors())
app.use(express.json())

app.get('/api/health', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1')
    res.json({ ok: true })
  } catch (error) { next(error) }
})

app.get('/api/dashboard', async (_req, res, next) => {
  try {
    const [summary, events, projects, taskSummary, leaveRequests] = await Promise.all([
      pool.query(`SELECT
        COUNT(*) FILTER (WHERE status = 'active')::int AS total_employees,
        COUNT(*) FILTER (WHERE status = 'on_leave')::int AS on_leave,
        (SELECT COUNT(*) FROM projects WHERE status IN ('upcoming', 'in_progress'))::int AS active_projects,
        (SELECT COUNT(*) FROM leave_requests WHERE status = 'pending')::int AS pending_leave_requests
        FROM employees`),
      pool.query(`SELECT e.id, e.title, e.description, e.event_type, e.starts_at, e.ends_at,
        p.id AS project_id, p.project_code, p.name AS project_name, p.due_date
        FROM calendar_events e JOIN projects p ON p.id = e.project_id
        WHERE e.starts_at >= date_trunc('month', NOW()) - INTERVAL '1 month'
        ORDER BY e.starts_at ASC LIMIT 20`),
      pool.query(`SELECT p.id, p.project_code, p.name, p.description, p.status, p.risk_level, p.due_date, p.progress,
        m.full_name AS manager_name FROM projects p LEFT JOIN employees m ON m.id = p.manager_id
        ORDER BY p.due_date NULLS LAST, p.created_at DESC`),
      pool.query(`SELECT status, COUNT(*)::int AS count FROM tasks GROUP BY status`),
      pool.query(`SELECT l.id, l.leave_type, l.start_date, l.end_date, e.full_name
        FROM leave_requests l JOIN employees e ON e.id = l.employee_id
        WHERE l.status = 'pending' ORDER BY l.created_at ASC LIMIT 5`),
    ])
    res.json({ summary: summary.rows[0], events: events.rows, projects: projects.rows, taskSummary: taskSummary.rows, leaveRequests: leaveRequests.rows })
  } catch (error) { next(error) }
})

app.post('/api/events', async (req, res, next) => {
  const { projectId, title, description, eventType = 'meeting', startsAt, endsAt } = req.body
  if (!projectId || !title?.trim() || !startsAt) return res.status(400).json({ error: 'projectId, title, and startsAt are required.' })
  if (!['meeting', 'review', 'milestone'].includes(eventType)) return res.status(400).json({ error: 'Invalid event type.' })
  try {
    const result = await pool.query(`INSERT INTO calendar_events (project_id, title, description, event_type, starts_at, ends_at)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [projectId, title.trim(), description?.trim() || null, eventType, startsAt, endsAt || null])
    res.status(201).json(result.rows[0])
  } catch (error) { next(error) }
})

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(500).json({ error: 'Database request failed. Check DATABASE_URL and apply database/schema.sql.' })
})

app.listen(port, () => console.log(`Workly API listening on http://localhost:${port}`))
