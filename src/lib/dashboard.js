import { supabase } from './supabase'

const requireClient = () => {
  if (!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env.')
  return supabase
}

const emptyDashboard = { summary: { total_employees: 0, on_leave: 0, active_projects: 0, pending_leave_requests: 0 }, events: [], projects: [], taskSummary: [], leaveRequests: [] }

export async function getDashboard() {
  const client = requireClient()
  const [employees, projects, events, tasks, leaveRequests] = await Promise.all([
    client.from('employees').select('id, full_name, status'),
    client.from('projects').select('id, project_code, name, description, manager_id, status, risk_level, due_date, progress, created_at'),
    client.from('calendar_events').select('id, project_id, title, description, event_type, starts_at, ends_at').order('starts_at'),
    client.from('tasks').select('status'),
    client.from('leave_requests').select('id, employee_id, leave_type, start_date, end_date, status, created_at').eq('status', 'pending').order('created_at').limit(5),
  ])
  const failed = [employees, projects, events, tasks, leaveRequests].find((query) => query.error)
  if (failed?.error) throw failed.error
  const employeeById = new Map(employees.data.map((employee) => [employee.id, employee]))
  const projectById = new Map(projects.data.map((project) => [project.id, project]))
  const mappedProjects = projects.data.map((project) => ({ ...project, manager_name: employeeById.get(project.manager_id)?.full_name || null }))
  const mappedEvents = events.data.map((event) => ({ ...event, project_name: projectById.get(event.project_id)?.name || 'Unassigned project', project_code: projectById.get(event.project_id)?.project_code || '—', due_date: projectById.get(event.project_id)?.due_date || null }))
  const mappedLeave = leaveRequests.data.map((request) => ({ ...request, full_name: employeeById.get(request.employee_id)?.full_name || 'Unknown employee' }))
  const taskSummary = ['pending', 'in_progress', 'in_review', 'completed'].map((status) => ({ status, count: tasks.data.filter((task) => task.status === status).length }))
  return { summary: { total_employees: employees.data.filter((employee) => employee.status === 'active').length, on_leave: employees.data.filter((employee) => employee.status === 'on_leave').length, active_projects: projects.data.filter((project) => ['upcoming', 'in_progress'].includes(project.status)).length, pending_leave_requests: leaveRequests.data.length }, events: mappedEvents, projects: mappedProjects, taskSummary, leaveRequests: mappedLeave }
}

export async function createEvent({ projectId, title, description, eventType, startsAt }) {
  const client = requireClient()
  const { error } = await client.from('calendar_events').insert({ project_id: projectId, title: title.trim(), description: description.trim() || null, event_type: eventType, starts_at: new Date(startsAt).toISOString() })
  if (error) throw error
}

export { emptyDashboard }
