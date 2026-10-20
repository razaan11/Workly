import { supabase } from './supabase'

const requireClient = () => {
  if (!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env.')
  return supabase
}

const emptyDashboard = { summary: { total_employees: 0, on_leave: 0, active_projects: 0, pending_leave_requests: 0 }, employees: [], events: [], projects: [], tasks: [], leaveRequests: [], attendance: [], rewards: [], taskSummary: [] }

export async function getDashboard() {
  const client = requireClient()
  const [employees, projects, events, tasks, leaveRequests, attendance, rewards] = await Promise.all([
    client.from('employees').select('id, employee_code, full_name, email, department, designation, status, joined_on'),
    client.from('projects').select('id, project_code, name, description, manager_id, status, risk_level, due_date, progress, created_at'),
    client.from('calendar_events').select('id, project_id, title, description, event_type, starts_at, ends_at').order('starts_at'),
    client.from('tasks').select('id, project_id, assignee_id, title, status, due_date, created_at'),
    client.from('leave_requests').select('id, employee_id, leave_type, start_date, end_date, status, reason, created_at').order('created_at'),
    client.from('attendance_records').select('id, employee_id, attendance_date, check_in, check_out, work_mode, attendance_status, created_at').order('attendance_date', { ascending: false }),
    client.from('rewards').select('id, employee_id, reason, status, nominated_at, created_at').order('created_at', { ascending: false }),
  ])
  const failed = [employees, projects, events, tasks, leaveRequests, attendance, rewards].find((query) => query.error)
  if (failed?.error) throw failed.error
  const employeeById = new Map(employees.data.map((employee) => [employee.id, employee]))
  const projectById = new Map(projects.data.map((project) => [project.id, project]))
  const mappedProjects = projects.data.map((project) => ({ ...project, manager_name: employeeById.get(project.manager_id)?.full_name || null }))
  const mappedEvents = events.data.map((event) => ({ ...event, project_name: projectById.get(event.project_id)?.name || 'Unassigned project', project_code: projectById.get(event.project_id)?.project_code || '—', due_date: projectById.get(event.project_id)?.due_date || null }))
  const mappedLeave = leaveRequests.data.map((request) => ({ ...request, full_name: employeeById.get(request.employee_id)?.full_name || 'Unknown employee' }))
  const mappedTasks = tasks.data.map((task) => ({ ...task, project_name: projectById.get(task.project_id)?.name || 'Unknown project', assignee_name: employeeById.get(task.assignee_id)?.full_name || 'Unassigned' }))
  const mappedAttendance = attendance.data.map((record) => ({ ...record, full_name: employeeById.get(record.employee_id)?.full_name || 'Unknown employee' }))
  const mappedRewards = rewards.data.map((reward) => ({ ...reward, full_name: employeeById.get(reward.employee_id)?.full_name || 'Unknown employee' }))
  const taskSummary = ['pending', 'in_progress', 'in_review', 'completed'].map((status) => ({ status, count: tasks.data.filter((task) => task.status === status).length }))
  return { summary: { total_employees: employees.data.filter((employee) => employee.status === 'active').length, on_leave: employees.data.filter((employee) => employee.status === 'on_leave').length, active_projects: projects.data.filter((project) => ['upcoming', 'in_progress'].includes(project.status)).length, pending_leave_requests: leaveRequests.data.filter((request) => request.status === 'pending').length }, employees: employees.data, events: mappedEvents, projects: mappedProjects, tasks: mappedTasks, taskSummary, leaveRequests: mappedLeave, attendance: mappedAttendance, rewards: mappedRewards }
}

export async function createEvent({ projectId, title, description, eventType, startsAt }) {
  const client = requireClient()
  const { error } = await client.from('calendar_events').insert({ project_id: projectId, title: title.trim(), description: description.trim() || null, event_type: eventType, starts_at: new Date(startsAt).toISOString() })
  if (error) throw error
}

export { emptyDashboard }
