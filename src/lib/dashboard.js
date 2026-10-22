import { supabase } from './supabase'

const requireClient = () => {
  if (!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env.')
  return supabase
}
const emptyDashboard = { summary: { total_employees: 0, on_leave: 0, active_projects: 0, pending_leave_requests: 0 }, employees: [], events: [], projects: [], tasks: [], leaveRequests: [], attendance: [], rewards: [], documents: [], corrections: [], auditLogs: [], notifications: [], invitations: [], taskSummary: [] }

async function api(action, payload = {}) {
  const { data, error } = await requireClient().functions.invoke('workly-api', { body: { action, ...payload } })
  if (error) {
    let message = error.message
    if (typeof error.context?.json === 'function') {
      try {
        const responseBody = await error.context.json()
        message = responseBody?.error || message
      } catch {
        // Keep the Supabase client error when the response has no JSON body.
      }
    }
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export async function getDashboard() {
  const data = await api('dashboard')
  const employeeById = new Map(data.employees.map((employee) => [employee.id, employee]))
  const projectById = new Map(data.projects.map((project) => [project.id, project]))
  const projects = data.projects.map((project) => ({ ...project, manager_name: employeeById.get(project.manager_id)?.full_name || null }))
  const events = data.events.map((event) => ({ ...event, project_name: projectById.get(event.project_id)?.name || 'Unassigned project', project_code: projectById.get(event.project_id)?.project_code || '—', due_date: projectById.get(event.project_id)?.due_date || null }))
  const leaveRequests = data.leaveRequests.map((request) => ({ ...request, full_name: employeeById.get(request.employee_id)?.full_name || 'Unknown employee' }))
  const tasks = data.tasks.map((task) => ({ ...task, project_name: projectById.get(task.project_id)?.name || 'Unknown project', assignee_name: employeeById.get(task.assignee_id)?.full_name || 'Unassigned' }))
  const attendance = data.attendance.map((record) => ({ ...record, full_name: employeeById.get(record.employee_id)?.full_name || 'Unknown employee' }))
  const rewards = data.rewards.map((reward) => ({ ...reward, full_name: employeeById.get(reward.employee_id)?.full_name || 'Unknown employee' }))
  const taskSummary = ['pending', 'in_progress', 'in_review', 'completed'].map((status) => ({ status, count: tasks.filter((task) => task.status === status).length }))
  return { summary: { total_employees: data.employees.filter((employee) => employee.status === 'active').length, on_leave: data.employees.filter((employee) => employee.status === 'on_leave').length, active_projects: projects.filter((project) => ['upcoming', 'in_progress'].includes(project.status)).length, pending_leave_requests: leaveRequests.filter((request) => request.status === 'pending').length }, employees: data.employees, events, projects, tasks, leaveRequests, attendance, rewards, documents: data.documents || [], corrections: data.corrections || [], auditLogs: data.auditLogs || [], notifications: data.notifications || [], invitations: data.invitations || [], taskSummary }
}

export const createEvent = (values) => api('create', { table: 'calendar_events', values: { project_id: values.projectId, title: values.title, description: values.description, event_type: values.eventType, starts_at: new Date(values.startsAt).toISOString() } })
export const saveRecord = (table, values, id) => api(id ? 'update' : 'create', { table, values, id })
export const decideLeave = (requestId, decision, chargeableDays, reason) => api('decide_leave', { requestId, decision, chargeableDays, reason })
export const decideAttendanceCorrection = (correctionId, decision, reason) => api('decide_attendance_correction', { correctionId, decision, reason })
export const inviteAdmin = (email, redirectTo) => api('invite', { email, redirectTo })
export const inviteEmployee = (employeeId, redirectTo) => api('invite_employee', { employeeId, redirectTo })
export { emptyDashboard }
