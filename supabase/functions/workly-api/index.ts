import { withSupabase } from 'npm:@supabase/server@1'

const json = (body: unknown, status = 200) => Response.json(body, { status })
const tableFields: Record<string, string[]> = {
  employees: ['employee_code', 'full_name', 'email', 'department', 'designation', 'status', 'joined_on'],
  projects: ['project_code', 'name', 'description', 'manager_id', 'status', 'risk_level', 'start_date', 'due_date', 'progress'],
  tasks: ['project_id', 'assignee_id', 'title', 'status', 'due_date'],
  leave_requests: ['employee_id', 'leave_type', 'start_date', 'end_date', 'status', 'reason'],
  attendance_records: ['employee_id', 'attendance_date', 'check_in', 'check_out', 'work_mode', 'attendance_status', 'correction_reason'],
  rewards: ['employee_id', 'reason', 'status', 'nominated_at'],
  calendar_events: ['project_id', 'title', 'description', 'event_type', 'starts_at', 'ends_at'],
  employee_documents: ['employee_id', 'document_name', 'document_type', 'storage_path', 'expiry_date'],
  leave_balances: ['employee_id', 'leave_type', 'balance_days'],
}

const safeRecord = (table: string, values: Record<string, unknown>) => Object.fromEntries(
  tableFields[table].filter((field) => values[field] !== undefined).map((field) => [field, values[field]]),
)

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, ctx) => {
    if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405)
    const { data: { user } } = await ctx.supabase.auth.getUser()
    if (!user) return json({ error: 'Authentication required.' }, 401)
    const { data: admin } = await ctx.supabaseAdmin.from('app_admins').select('user_id').eq('user_id', user.id).maybeSingle()
    if (!admin) return json({ error: 'Administrator access is required.' }, 403)
    const body = await request.json()
    const action = body?.action

    if (action === 'dashboard') {
      const [employees, projects, events, tasks, leaveRequests, attendance, rewards] = await Promise.all([
        ctx.supabaseAdmin.from('employees').select('*'), ctx.supabaseAdmin.from('projects').select('*'),
        ctx.supabaseAdmin.from('calendar_events').select('*').order('starts_at'), ctx.supabaseAdmin.from('tasks').select('*'),
        ctx.supabaseAdmin.from('leave_requests').select('*').order('created_at'), ctx.supabaseAdmin.from('attendance_records').select('*').order('attendance_date', { ascending: false }),
        ctx.supabaseAdmin.from('rewards').select('*').order('created_at', { ascending: false }),
      ])
      const failed = [employees, projects, events, tasks, leaveRequests, attendance, rewards].find((result) => result.error)
      if (failed?.error) return json({ error: failed.error.message }, 400)
      return json({ employees: employees.data, projects: projects.data, events: events.data, tasks: tasks.data, leaveRequests: leaveRequests.data, attendance: attendance.data, rewards: rewards.data })
    }

    if (action === 'create' || action === 'update') {
      const { table, values, id } = body
      if (!tableFields[table] || !values || (action === 'update' && !id)) return json({ error: 'Invalid record request.' }, 400)
      const record = safeRecord(table, values)
      const query = action === 'create'
        ? ctx.supabaseAdmin.from(table).insert(record).select().single()
        : ctx.supabaseAdmin.from(table).update(record).eq('id', id).select().single()
      const { data, error } = await query
      if (error) return json({ error: error.message }, 400)
      await ctx.supabaseAdmin.from('audit_logs').insert({ actor_id: user.id, action, module: table, record_id: data.id, new_value: data })
      return json({ data }, action === 'create' ? 201 : 200)
    }

    if (action === 'invite') {
      const email = String(body?.email || '').trim().toLowerCase()
      if (!email) return json({ error: 'Email is required.' }, 400)
      const { data, error } = await ctx.supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo: body?.redirectTo })
      if (error) return json({ error: error.message }, 400)
      await ctx.supabaseAdmin.from('admin_invitations').upsert({ email, invited_by: user.id })
      await ctx.supabaseAdmin.from('audit_logs').insert({ actor_id: user.id, action: 'invite', module: 'admin_invitations', new_value: { email } })
      return json({ data }, 201)
    }
    return json({ error: 'Unknown action.' }, 400)
  }),
}
