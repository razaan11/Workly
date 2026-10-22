import { withSupabase } from 'npm:@supabase/server@1'

const json = (body: unknown, status = 200) => Response.json(body, { status })
const tableFields: Record<string, string[]> = {
  employees: ['employee_code', 'full_name', 'email', 'department', 'designation', 'status', 'joined_on', 'photo_path', 'date_of_birth', 'phone', 'address', 'emergency_contact', 'employment_type', 'probation_end', 'notice_period_days', 'reporting_manager_id', 'qualifications', 'skills', 'experience_summary', 'work_history', 'assigned_assets', 'custom_fields', 'account_status'],
  projects: ['project_code', 'name', 'description', 'manager_id', 'team_lead_id', 'status', 'risk_level', 'start_date', 'due_date', 'progress', 'cancelled_at'],
  tasks: ['project_id', 'assignee_id', 'assigned_by', 'title', 'description', 'status', 'start_date', 'due_date', 'priority', 'milestone_id', 'dependency_note', 'blocker_note', 'deliverable_url'],
  leave_requests: ['employee_id', 'leave_type', 'start_date', 'end_date', 'status', 'reason', 'day_portion', 'supporting_document_path', 'handover_information', 'emergency_contact', 'chargeable_days', 'decision_reason', 'policy_exception'],
  attendance_records: ['employee_id', 'attendance_date', 'check_in', 'check_out', 'work_mode', 'attendance_status', 'correction_reason', 'shift_name', 'break_minutes', 'overtime_minutes', 'total_work_minutes'],
  rewards: ['employee_id', 'reason', 'status', 'nominated_at', 'decision_reason'],
  calendar_events: ['project_id', 'title', 'description', 'event_type', 'starts_at', 'ends_at'],
  employee_documents: ['employee_id', 'document_name', 'document_type', 'storage_path', 'expiry_date'],
  leave_balances: ['employee_id', 'leave_type', 'balance_days'],
  departments: ['name'],
  designations: ['name'],
  project_members: ['project_id', 'employee_id', 'role_name'],
  project_milestones: ['project_id', 'title', 'due_date', 'status'],
  task_comments: ['task_id', 'body'],
  notification_preferences: ['event_name', 'delivery_channel', 'enabled', 'recipient_rule'],
  employee_documents: ['employee_id', 'document_name', 'document_type', 'storage_path', 'expiry_date', 'access_level'],
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
      const [employees, projects, events, tasks, leaveRequests, attendance, rewards, documents, corrections, auditLogs, notifications, invitations] = await Promise.all([
        ctx.supabaseAdmin.from('employees').select('*'), ctx.supabaseAdmin.from('projects').select('*'),
        ctx.supabaseAdmin.from('calendar_events').select('*').order('starts_at'), ctx.supabaseAdmin.from('tasks').select('*'),
        ctx.supabaseAdmin.from('leave_requests').select('*').order('created_at'), ctx.supabaseAdmin.from('attendance_records').select('*').order('attendance_date', { ascending: false }),
        ctx.supabaseAdmin.from('rewards').select('*').order('created_at', { ascending: false }),
        ctx.supabaseAdmin.from('employee_documents').select('*').order('expiry_date'),
        ctx.supabaseAdmin.from('attendance_corrections').select('*').order('created_at', { ascending: false }),
        ctx.supabaseAdmin.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(50),
        ctx.supabaseAdmin.from('notifications').select('*').order('created_at', { ascending: false }).limit(50),
        ctx.supabaseAdmin.from('employee_invitations').select('*').order('created_at', { ascending: false }),
      ])
      const failed = [employees, projects, events, tasks, leaveRequests, attendance, rewards, documents, corrections, auditLogs, notifications, invitations].find((result) => result.error)
      if (failed?.error) return json({ error: failed.error.message }, 400)
      return json({ employees: employees.data, projects: projects.data, events: events.data, tasks: tasks.data, leaveRequests: leaveRequests.data, attendance: attendance.data, rewards: rewards.data, documents: documents.data, corrections: corrections.data, auditLogs: auditLogs.data, notifications: notifications.data, invitations: invitations.data })
    }

    if (action === 'create' || action === 'update') {
      const { table, values, id } = body
      if (!tableFields[table] || !values || (action === 'update' && !id)) return json({ error: 'Invalid record request.' }, 400)
      const record = safeRecord(table, values)
      if (table === 'rewards' && action === 'update' && ['approved', 'rejected'].includes(String(values.status))) {
        record.decided_by = user.id
        record.decided_at = new Date().toISOString()
      }
      const previous = action === 'update' ? await ctx.supabaseAdmin.from(table).select('*').eq('id', id).maybeSingle() : { data: null, error: null }
      if (previous.error || (action === 'update' && !previous.data)) return json({ error: 'The record was not found.' }, 404)
      const query = action === 'create'
        ? ctx.supabaseAdmin.from(table).insert(record).select().single()
        : ctx.supabaseAdmin.from(table).update(record).eq('id', id).select().single()
      const { data, error } = await query
      if (error) return json({ error: error.message }, 400)
      if (table === 'tasks' && action === 'update' && previous.data.assignee_id !== data.assignee_id) {
        await ctx.supabaseAdmin.from('task_reassignments').insert({ task_id: data.id, previous_assignee_id: previous.data.assignee_id, new_assignee_id: data.assignee_id, reason: String(values.reassignment_reason || 'Reassigned by administrator'), changed_by: user.id })
      }
      await ctx.supabaseAdmin.from('audit_logs').insert({ actor_id: user.id, action, module: table, record_id: data.id, previous_value: previous.data, new_value: data })
      return json({ data }, action === 'create' ? 201 : 200)
    }

    if (action === 'decide_leave') {
      const requestId = String(body?.requestId || '')
      const decision = body?.decision
      const chargeableDays = Number(body?.chargeableDays)
      if (!requestId || !['approved', 'rejected'].includes(decision) || !Number.isFinite(chargeableDays) || chargeableDays < 0) return json({ error: 'A valid leave decision and chargeable-day value are required.' }, 400)
      const { data, error } = await ctx.supabaseAdmin.rpc('decide_leave_request', { p_request_id: requestId, p_decision: decision, p_chargeable_days: chargeableDays, p_reason: String(body?.reason || ''), p_actor_id: user.id })
      if (error) return json({ error: error.message }, 400)
      await ctx.supabaseAdmin.from('audit_logs').insert({ actor_id: user.id, action: decision, module: 'leave_requests', record_id: requestId, new_value: data })
      return json({ data })
    }

    if (action === 'decide_attendance_correction') {
      const correctionId = String(body?.correctionId || '')
      const decision = body?.decision
      if (!correctionId || !['approved', 'rejected'].includes(decision)) return json({ error: 'A valid attendance correction decision is required.' }, 400)
      const { data: correction, error: correctionError } = await ctx.supabaseAdmin.from('attendance_corrections').select('*').eq('id', correctionId).single()
      if (correctionError || correction.status !== 'pending') return json({ error: 'This correction request is unavailable for decision.' }, 400)
      if (decision === 'approved') {
        const { data: original } = await ctx.supabaseAdmin.from('attendance_records').select('*').eq('id', correction.attendance_record_id).single()
        const { data: updated, error: updateError } = await ctx.supabaseAdmin.from('attendance_records').update({ check_in: correction.requested_check_in, check_out: correction.requested_check_out, correction_reason: correction.reason }).eq('id', correction.attendance_record_id).select().single()
        if (updateError) return json({ error: updateError.message }, 400)
        await ctx.supabaseAdmin.from('audit_logs').insert({ actor_id: user.id, action: 'approve_correction', module: 'attendance_records', record_id: updated.id, previous_value: original, new_value: updated })
      }
      const { data, error } = await ctx.supabaseAdmin.from('attendance_corrections').update({ status: decision, decided_by: user.id, decided_at: new Date().toISOString(), decision_reason: String(body?.reason || '') }).eq('id', correctionId).select().single()
      if (error) return json({ error: error.message }, 400)
      return json({ data })
    }

    if (action === 'delete') {
      const { table, id } = body
      if (!tableFields[table] || !id) return json({ error: 'Invalid delete request.' }, 400)
      if (table === 'projects') {
        const { count } = await ctx.supabaseAdmin.from('tasks').select('id', { count: 'exact', head: true }).eq('project_id', id)
        if (count) return json({ error: 'This project cannot be deleted because it has related tasks. Close or reassign its tasks first.' }, 409)
      }
      const { data: previous } = await ctx.supabaseAdmin.from(table).select('*').eq('id', id).maybeSingle()
      const { error } = await ctx.supabaseAdmin.from(table).delete().eq('id', id)
      if (error) return json({ error: error.message }, 400)
      await ctx.supabaseAdmin.from('audit_logs').insert({ actor_id: user.id, action: 'delete', module: table, record_id: id, previous_value: previous })
      return json({ success: true })
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
    if (action === 'invite_employee') {
      const employeeId = String(body?.employeeId || '')
      const { data: employee, error: employeeError } = await ctx.supabaseAdmin.from('employees').select('id,email,full_name').eq('id', employeeId).single()
      if (employeeError || !employee?.email) return json({ error: 'A valid employee with an email address is required.' }, 400)
      const { data, error } = await ctx.supabaseAdmin.auth.admin.inviteUserByEmail(employee.email, { redirectTo: body?.redirectTo })
      if (error) return json({ error: error.message }, 400)
      await ctx.supabaseAdmin.from('employee_invitations').insert({ employee_id: employee.id, email: employee.email, invited_by: user.id })
      await ctx.supabaseAdmin.from('employees').update({ account_status: 'invited' }).eq('id', employee.id)
      await ctx.supabaseAdmin.from('audit_logs').insert({ actor_id: user.id, action: 'invite_employee', module: 'employees', record_id: employee.id, new_value: { email: employee.email } })
      return json({ data }, 201)
    }
    return json({ error: 'Unknown action.' }, 400)
  }),
}
