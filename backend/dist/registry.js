// Helper to add days to a date
const addDays = (dateStr, days) => {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
};
export const toolsRegistry = [
    // ================= HR DEPARTMENT =================
    {
        name: 'leave_balance',
        title: 'Get Leave Balance',
        description: 'Retrieves the remaining balance for casual, sick, and annual leaves.',
        department: 'Human Resources',
        requiredPermissions: ['Employee', 'Manager', 'HR', 'Finance', 'IT_Admin'],
        inputSchema: {},
        outputSchema: {
            casual: 'number',
            sick: 'number',
            annual: 'number',
            pendingApproval: 'number'
        },
        mockHandler: (params, ctx) => {
            const userDb = ctx.db.getUserData(ctx.userId);
            return {
                userId: ctx.userId,
                userName: ctx.userName,
                casual: userDb.leaves.casual,
                sick: userDb.leaves.sick,
                annual: userDb.leaves.annual,
                pendingApproval: userDb.leaves.pendingApproval,
                status: 'Active'
            };
        }
    },
    {
        name: 'apply_leave',
        title: 'Apply for Leave',
        description: 'Submits a leave request for casual, sick, or annual leave.',
        department: 'Human Resources',
        requiredPermissions: ['Employee', 'Manager', 'HR', 'Finance', 'IT_Admin'],
        inputSchema: {
            startDate: { type: 'date', description: 'Start date of the leave (YYYY-MM-DD)', required: true },
            endDate: { type: 'date', description: 'End date of the leave (YYYY-MM-DD)', required: true },
            leaveType: { type: 'string', description: 'Type of leave', required: true, enum: ['casual', 'sick', 'annual'] },
            reason: { type: 'string', description: 'Reason for requesting leave', required: true }
        },
        outputSchema: {
            requestId: 'string',
            status: 'string',
            daysApplied: 'number',
            remainingBalance: 'number'
        },
        mockHandler: (params, ctx) => {
            const userDb = ctx.db.getUserData(ctx.userId);
            const start = new Date(params.startDate);
            const end = new Date(params.endDate);
            const diffTime = Math.abs(end.getTime() - start.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            const type = (params.leaveType || 'casual').toLowerCase();
            const currentBalance = userDb.leaves[type];
            if (currentBalance < diffDays) {
                throw new Error(`Insufficient leave balance. Requested ${diffDays} days of ${type} leave, but only have ${currentBalance} days left.`);
            }
            // Update DB
            userDb.leaves[type] -= diffDays;
            userDb.leaves.pendingApproval += diffDays;
            const reqId = 'LV-' + Math.floor(Math.random() * 9000 + 1000);
            const leaveRequest = {
                requestId: reqId,
                startDate: params.startDate,
                endDate: params.endDate,
                leaveType: type,
                reason: params.reason,
                days: diffDays,
                status: 'Pending Approval'
            };
            userDb.leaveRequests = userDb.leaveRequests || [];
            userDb.leaveRequests.push(leaveRequest);
            return {
                message: `Successfully applied for ${diffDays} days of ${type} leave.`,
                requestId: reqId,
                daysApplied: diffDays,
                startDate: params.startDate,
                endDate: params.endDate,
                leaveType: type,
                status: 'Pending Approval',
                remainingBalance: userDb.leaves[type]
            };
        }
    },
    {
        name: 'cancel_leave',
        title: 'Cancel Leave Request',
        description: 'Cancels an applied leave request and restores the leave balance.',
        department: 'Human Resources',
        requiredPermissions: ['Employee', 'Manager', 'HR'],
        inputSchema: {
            requestId: { type: 'string', description: 'The unique ID of the leave request (e.g. LV-1234)', required: true }
        },
        outputSchema: {
            requestId: 'string',
            status: 'string',
            restoredDays: 'number'
        },
        mockHandler: (params, ctx) => {
            const userDb = ctx.db.getUserData(ctx.userId);
            const requests = userDb.leaveRequests || [];
            const reqIndex = requests.findIndex((r) => r.requestId === params.requestId);
            if (reqIndex === -1) {
                throw new Error(`Leave request ${params.requestId} not found.`);
            }
            const req = requests[reqIndex];
            if (req.status === 'Cancelled') {
                throw new Error(`Leave request ${params.requestId} is already cancelled.`);
            }
            // Restore balance
            const type = req.leaveType;
            userDb.leaves[type] += req.days;
            if (req.status === 'Pending Approval') {
                userDb.leaves.pendingApproval -= req.days;
            }
            req.status = 'Cancelled';
            return {
                message: `Leave request ${params.requestId} has been cancelled successfully.`,
                requestId: params.requestId,
                status: 'Cancelled',
                restoredDays: req.days,
                restoredType: type
            };
        }
    },
    {
        name: 'download_payslip',
        title: 'Download Payslip',
        description: 'Generates and downloads the PDF payslip for a specific month and year.',
        department: 'Human Resources',
        requiredPermissions: ['Employee', 'Manager', 'HR', 'Finance'],
        inputSchema: {
            month: { type: 'string', description: 'Month of the payslip', required: true, enum: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] },
            year: { type: 'number', description: 'Year of the payslip (e.g., 2026)', required: true }
        },
        outputSchema: {
            downloadUrl: 'string',
            fileName: 'string',
            earnings: 'object'
        },
        mockHandler: (params, ctx) => {
            return {
                employeeName: ctx.userName,
                period: `${params.month} ${params.year}`,
                fileName: `Payslip_${ctx.userName.replace(/\s+/g, '_')}_${params.month}_${params.year}.pdf`,
                downloadUrl: `/api/payslips/download?empId=${ctx.userId}&month=${params.month}&year=${params.year}`,
                salaryDetails: {
                    basic: 5400,
                    hra: 2160,
                    specialAllowance: 3200,
                    grossEarnings: 10760,
                    providentFund: 648,
                    professionalTax: 200,
                    taxDeductedAtSource: 920,
                    totalDeductions: 1768,
                    netSalary: 8992
                }
            };
        }
    },
    {
        name: 'attendance_status',
        title: 'Get Attendance Status',
        description: 'Retrieves attendance metrics (present days, late arrivals, half days) for a given month.',
        department: 'Human Resources',
        requiredPermissions: ['Employee', 'Manager', 'HR'],
        inputSchema: {
            month: { type: 'string', description: 'Month (e.g., June)', required: false }
        },
        outputSchema: {
            present: 'number',
            absent: 'number',
            halfDay: 'number',
            lateArrivals: 'number'
        },
        mockHandler: (params, ctx) => {
            const month = params.month || 'Current Month';
            return {
                userId: ctx.userId,
                userName: ctx.userName,
                period: month,
                totalWorkingDays: 22,
                present: 20,
                absent: 1,
                halfDay: 1,
                lateArrivals: 2,
                averageCheckInTime: '09:12 AM',
                averageCheckOutTime: '06:05 PM'
            };
        }
    },
    {
        name: 'holiday_calendar',
        title: 'View Holiday Calendar',
        description: 'Retrieves the list of corporate holidays for the current year.',
        department: 'Human Resources',
        requiredPermissions: ['Employee', 'Manager', 'HR', 'Finance', 'IT_Admin'],
        inputSchema: {},
        outputSchema: {
            holidays: 'array'
        },
        mockHandler: (params, ctx) => {
            return {
                year: 2026,
                holidays: [
                    { name: 'New Year\'s Day', date: '2026-01-01', day: 'Thursday' },
                    { name: 'Republic Day', date: '2026-01-26', day: 'Monday' },
                    { name: 'Good Friday', date: '2026-04-03', day: 'Friday' },
                    { name: 'Labor Day', date: '2026-05-01', day: 'Friday' },
                    { name: 'Independence Day', date: '2026-07-04', day: 'Saturday' },
                    { name: 'Labor Day (US)', date: '2026-09-07', day: 'Monday' },
                    { name: 'Thanksgiving', date: '2026-11-26', day: 'Thursday' },
                    { name: 'Christmas Day', date: '2026-12-25', day: 'Friday' }
                ]
            };
        }
    },
    {
        name: 'employee_directory',
        title: 'Search Employee Directory',
        description: 'Searches the enterprise employee directory by name, role, or department.',
        department: 'Human Resources',
        requiredPermissions: ['Employee', 'Manager', 'HR', 'IT_Admin'],
        inputSchema: {
            searchQuery: { type: 'string', description: 'Search term for name, title, or department', required: true }
        },
        outputSchema: {
            results: 'array'
        },
        mockHandler: (params, ctx) => {
            const employees = [
                { id: 'E101', name: 'Amit Sharma', role: 'Software Engineer', department: 'IT', email: 'amit.s@enterprise.com' },
                { id: 'E102', name: 'Rahul Varma', role: 'Engineering Manager', department: 'Project Management', email: 'rahul.v@enterprise.com' },
                { id: 'E103', name: 'Priya Nair', role: 'HR Generalist', department: 'Human Resources', email: 'priya.n@enterprise.com' },
                { id: 'E104', name: 'John Doe', role: 'Finance Director', department: 'Finance', email: 'john.d@enterprise.com' },
                { id: 'E105', name: 'Sarah Connor', role: 'Security Architect', department: 'Security', email: 'sarah.c@enterprise.com' },
                { id: 'E106', name: 'David Lee', role: 'Marketing Lead', department: 'Marketing', email: 'david.l@enterprise.com' }
            ];
            const query = params.searchQuery.toLowerCase();
            const filtered = employees.filter(e => e.name.toLowerCase().includes(query) ||
                e.role.toLowerCase().includes(query) ||
                e.department.toLowerCase().includes(query));
            return {
                searchQuery: params.searchQuery,
                matchesCount: filtered.length,
                results: filtered
            };
        }
    },
    {
        name: 'update_profile',
        title: 'Update Profile Details',
        description: 'Updates personal details like home address or phone number in employee profile.',
        department: 'Human Resources',
        requiredPermissions: ['Employee', 'Manager', 'HR', 'IT_Admin'],
        inputSchema: {
            phone: { type: 'string', description: 'New contact number', required: false },
            address: { type: 'string', description: 'New residential address', required: false }
        },
        outputSchema: {
            success: 'boolean',
            updatedFields: 'object'
        },
        mockHandler: (params, ctx) => {
            const userDb = ctx.db.getUserData(ctx.userId);
            const updatedFields = {};
            if (params.phone) {
                userDb.phone = params.phone;
                updatedFields.phone = params.phone;
            }
            if (params.address) {
                userDb.address = params.address;
                updatedFields.address = params.address;
            }
            return {
                success: true,
                message: 'Profile information updated successfully in HR database.',
                updatedFields
            };
        }
    },
    // ================= IT DEPARTMENT =================
    {
        name: 'reset_vpn_password',
        title: 'Reset VPN Password',
        description: 'Resets the user VPN password and provides a temporary credential.',
        department: 'Information Technology',
        requiredPermissions: ['Employee', 'Manager', 'HR', 'Finance', 'IT_Admin'],
        inputSchema: {},
        outputSchema: {
            temporaryPassword: 'string',
            expiryMinutes: 'number',
            instructions: 'string'
        },
        mockHandler: (params, ctx) => {
            const tempPass = 'VPN-' + Math.random().toString(36).substring(2, 10).toUpperCase() + '!';
            return {
                status: 'Password Reset Successful',
                username: ctx.userName.replace(/\s+/g, '.').toLowerCase(),
                temporaryPassword: tempPass,
                expiryMinutes: 15,
                instructions: 'Please log in to the VPN client using this temporary password and reset it immediately.'
            };
        }
    },
    {
        name: 'unlock_ad_account',
        title: 'Unlock AD Account',
        description: 'Unlocks a locked active directory user account.',
        department: 'Information Technology',
        requiredPermissions: ['IT_Admin'],
        inputSchema: {
            username: { type: 'string', description: 'AD username to unlock', required: true }
        },
        outputSchema: {
            status: 'string',
            unlockedAt: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                username: params.username,
                status: 'Unlocked Successfully',
                domain: 'corp.enterprise.local',
                unlockedAt: new Date().toISOString(),
                unlockedBy: ctx.userName
            };
        }
    },
    {
        name: 'request_software',
        title: 'Request Software Installation',
        description: 'Submits a request to install licensed software on a workstation.',
        department: 'Information Technology',
        requiredPermissions: ['Employee', 'Manager', 'HR', 'Finance', 'IT_Admin'],
        inputSchema: {
            softwareName: { type: 'string', description: 'Name of the software (e.g., JetBrains, Docker, Tableau)', required: true },
            reason: { type: 'string', description: 'Justification for software access', required: true }
        },
        outputSchema: {
            requestId: 'string',
            status: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                requestId: 'SW-' + Math.floor(Math.random() * 90000 + 10000),
                softwareName: params.softwareName,
                requestedFor: ctx.userName,
                status: 'Pending Approval',
                message: 'Your software installation request has been logged. IT approvals require manager authorization.'
            };
        }
    },
    {
        name: 'request_laptop',
        title: 'Request Laptop Hardware Upgrade',
        description: 'Submits a request for a new laptop or a hardware upgrade.',
        department: 'Information Technology',
        requiredPermissions: ['Employee', 'Manager', 'HR', 'IT_Admin'],
        inputSchema: {
            modelType: { type: 'string', description: 'Preferred Model (e.g. MacBook Pro 16, ThinkPad X1 Carbon)', required: true, enum: ['MacBook Pro 14', 'MacBook Pro 16', 'Lenovo ThinkPad X1', 'Dell Latitude'] },
            reason: { type: 'string', description: 'Reason for upgrade or new device request', required: true }
        },
        outputSchema: {
            requestId: 'string',
            status: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                requestId: 'HW-' + Math.floor(Math.random() * 90000 + 10000),
                modelType: params.modelType,
                status: 'Awaiting Manager Review',
                allocatedBudget: '$2,500',
                requestedDate: new Date().toISOString().split('T')[0]
            };
        }
    },
    {
        name: 'wifi_guest_access',
        title: 'Generate Wi-Fi Guest Access',
        description: 'Generates guest Wi-Fi access tokens for external visitors.',
        department: 'Information Technology',
        requiredPermissions: ['Employee', 'Manager', 'HR', 'IT_Admin'],
        inputSchema: {
            guestName: { type: 'string', description: 'Full name of the guest visitor', required: true },
            durationDays: { type: 'number', description: 'Duration of access in days (1-7)', required: true }
        },
        outputSchema: {
            ssid: 'string',
            passcode: 'string',
            expiry: 'string'
        },
        mockHandler: (params, ctx) => {
            const passcode = Math.floor(Math.random() * 899999 + 100000).toString();
            const expiryDate = addDays(new Date(), params.durationDays);
            return {
                ssid: 'Enterprise-Guest',
                guestName: params.guestName,
                passcode,
                expiry: expiryDate + ' 23:59:59',
                instructions: 'Connect to "Enterprise-Guest" SSID and enter the passcode when prompted.'
            };
        }
    },
    {
        name: 'create_it_ticket',
        title: 'Create IT Support Ticket',
        description: 'Logs a support ticket for hardware, software, or network issues.',
        department: 'Information Technology',
        requiredPermissions: ['Employee', 'Manager', 'HR', 'Finance', 'IT_Admin'],
        inputSchema: {
            issueDescription: { type: 'string', description: 'Detailed description of the issue', required: true },
            category: { type: 'string', description: 'Category of IT issue', required: true, enum: ['Hardware', 'Software', 'Network', 'Access Management'] }
        },
        outputSchema: {
            ticketId: 'string',
            status: 'string',
            assignedTeam: 'string'
        },
        mockHandler: (params, ctx) => {
            const ticketId = 'INC-' + Math.floor(Math.random() * 900000 + 100000);
            return {
                ticketId,
                category: params.category,
                issueDescription: params.issueDescription,
                status: 'New / Unassigned',
                priority: 'P3 - Medium',
                assignedTeam: params.category + ' Operations Desk',
                slaTargetTime: '8 Hours'
            };
        }
    },
    {
        name: 'get_ticket_status',
        title: 'Get IT Ticket Status',
        description: 'Retrieves status and history for a specific IT support ticket.',
        department: 'Information Technology',
        requiredPermissions: ['Employee', 'Manager', 'HR', 'Finance', 'IT_Admin'],
        inputSchema: {
            ticketId: { type: 'string', description: 'Support ticket ID (e.g. INC-123456)', required: true }
        },
        outputSchema: {
            ticketId: 'string',
            status: 'string',
            history: 'array'
        },
        mockHandler: (params, ctx) => {
            return {
                ticketId: params.ticketId,
                status: 'In Progress',
                priority: 'P2 - High',
                assignedEngineer: 'Jane Cooper (Network Operations)',
                updatedAt: new Date().toISOString(),
                description: 'VPN connection dropouts on local client',
                history: [
                    { time: addDays(new Date(), -1) + ' 10:00:00', author: 'System', comment: 'Ticket created and assigned to NetOps' },
                    { time: new Date().toISOString(), author: 'Jane Cooper', comment: 'Reviewing VPN server connection logs. Requested trace logs.' }
                ]
            };
        }
    },
    {
        name: 'vpn_access_request',
        title: 'Request VPN Access Permissions',
        description: 'Requests access to restricted VPN groups (e.g., production environments).',
        department: 'Information Technology',
        requiredPermissions: ['Employee', 'Manager', 'IT_Admin'],
        inputSchema: {
            serverGroupName: { type: 'string', description: 'The server group (e.g., Production, Staging, Financials)', required: true },
            reason: { type: 'string', description: 'Business justification for access', required: true }
        },
        outputSchema: {
            requestId: 'string',
            status: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                requestId: 'REQ-VPN-' + Math.floor(Math.random() * 9000 + 1000),
                serverGroupName: params.serverGroupName,
                status: 'Awaiting Manager & Security Approvals',
                requiredApprovals: ['Manager Approval', 'CISO Compliance Review']
            };
        }
    },
    // ================= FINANCE DEPARTMENT =================
    {
        name: 'submit_reimbursement',
        title: 'Submit Expense Reimbursement',
        description: 'Submits a new business expense reimbursement claim.',
        department: 'Finance',
        requiredPermissions: ['Employee', 'Manager', 'HR', 'Finance', 'IT_Admin'],
        inputSchema: {
            amount: { type: 'number', description: 'Amount in USD', required: true },
            category: { type: 'string', description: 'Expense category', required: true, enum: ['Travel', 'Meals', 'Office Supplies', 'Client Entertainment', 'Training'] },
            date: { type: 'date', description: 'Date of expenditure (YYYY-MM-DD)', required: true },
            description: { type: 'string', description: 'Brief description of the expense', required: true }
        },
        outputSchema: {
            claimId: 'string',
            status: 'string',
            claimAmount: 'number'
        },
        mockHandler: (params, ctx) => {
            const claimId = 'EXP-' + Math.floor(Math.random() * 90000 + 10000);
            return {
                claimId,
                category: params.category,
                claimAmount: params.amount,
                description: params.description,
                date: params.date,
                status: 'Submitted / Under Review',
                approver: 'Finance Ops Team',
                message: 'Reimbursement request submitted. Claims are processed during the bi-weekly run.'
            };
        }
    },
    {
        name: 'get_reimbursement_status',
        title: 'Get Reimbursement Status',
        description: 'Checks the status of an existing reimbursement claim.',
        department: 'Finance',
        requiredPermissions: ['Employee', 'Manager', 'HR', 'Finance'],
        inputSchema: {
            claimId: { type: 'string', description: 'Reimbursement claim ID (e.g. EXP-12345)', required: true }
        },
        outputSchema: {
            claimId: 'string',
            status: 'string',
            payoutDate: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                claimId: params.claimId,
                status: 'Approved',
                payoutAmount: 245.50,
                approvedBy: 'John Doe (Finance)',
                approvedDate: addDays(new Date(), -2),
                estimatedPayoutDate: addDays(new Date(), 4),
                paymentMethod: 'Direct Deposit / Payroll Add-on'
            };
        }
    },
    {
        name: 'generate_invoice',
        title: 'Generate Client Invoice',
        description: 'Creates a billing invoice for client accounts.',
        department: 'Finance',
        requiredPermissions: ['Finance', 'Sales'],
        inputSchema: {
            clientName: { type: 'string', description: 'Client company name', required: true },
            amount: { type: 'number', description: 'Invoice amount in USD', required: true },
            dueDate: { type: 'date', description: 'Invoice payment due date (YYYY-MM-DD)', required: true }
        },
        outputSchema: {
            invoiceNumber: 'string',
            status: 'string',
            pdfUrl: 'string'
        },
        mockHandler: (params, ctx) => {
            const invNum = 'INV-2026-' + Math.floor(Math.random() * 9000 + 1000);
            return {
                invoiceNumber: invNum,
                clientName: params.clientName,
                totalAmount: params.amount,
                dueDate: params.dueDate,
                status: 'Draft Created',
                pdfUrl: `/api/finance/invoices/${invNum}.pdf`,
                message: `Invoice ${invNum} has been drafted and is ready to send.`
            };
        }
    },
    {
        name: 'get_budget_status',
        title: 'Get Department Budget Status',
        description: 'Checks the budget allocation and utilization of a specific department.',
        department: 'Finance',
        requiredPermissions: ['Manager', 'Finance', 'HR'],
        inputSchema: {
            targetDepartment: { type: 'string', description: 'Name of the department to check', required: true, enum: ['Engineering', 'Marketing', 'Sales', 'HR', 'IT', 'Customer Support', 'Operations'] }
        },
        outputSchema: {
            allocated: 'number',
            spent: 'number',
            remaining: 'number'
        },
        mockHandler: (params, ctx) => {
            const budgets = {
                'Engineering': { allocated: 500000, spent: 342000 },
                'Marketing': { allocated: 200000, spent: 178000 },
                'Sales': { allocated: 300000, spent: 210000 },
                'HR': { allocated: 100000, spent: 82000 },
                'IT': { allocated: 250000, spent: 195000 },
                'Customer Support': { allocated: 150000, spent: 112000 },
                'Operations': { allocated: 400000, spent: 290000 }
            };
            const dept = params.targetDepartment;
            const budget = budgets[dept] || { allocated: 100000, spent: 50000 };
            return {
                department: dept,
                allocatedBudget: budget.allocated,
                spentBudget: budget.spent,
                remainingBudget: budget.allocated - budget.spent,
                utilizationPercentage: ((budget.spent / budget.allocated) * 100).toFixed(1) + '%'
            };
        }
    },
    {
        name: 'submit_expense_report',
        title: 'Submit Monthly Expense Report',
        description: 'Compiles and submits a recurring department expense report.',
        department: 'Finance',
        requiredPermissions: ['Manager', 'Finance'],
        inputSchema: {
            reportMonth: { type: 'string', description: 'Month of report', required: true },
            lineItemsCount: { type: 'number', description: 'Number of items in the report', required: true },
            totalValue: { type: 'number', description: 'Aggregate sum of expenses', required: true }
        },
        outputSchema: {
            reportId: 'string',
            status: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                reportId: 'REP-EXP-' + Math.floor(Math.random() * 90000 + 10000),
                period: params.reportMonth,
                itemsCount: params.lineItemsCount,
                aggregateSum: params.totalValue,
                status: 'Received / Awaiting Finance Auditor Review',
                submittedBy: ctx.userName
            };
        }
    },
    {
        name: 'track_payment',
        title: 'Track Outgoing Vendor Payment',
        description: 'Tracks the transaction status of payments made to third-party vendors.',
        department: 'Finance',
        requiredPermissions: ['Finance', 'Manager'],
        inputSchema: {
            purchaseOrderNumber: { type: 'string', description: 'PO identifier (e.g. PO-12345)', required: true }
        },
        outputSchema: {
            paymentStatus: 'string',
            transactionId: 'string',
            clearedDate: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                poNumber: params.purchaseOrderNumber,
                vendorName: 'Global Cloud Systems Inc.',
                paymentStatus: 'Completed',
                amountPaid: 15400.00,
                transactionId: 'TXN-' + Math.random().toString(36).substring(2, 12).toUpperCase(),
                clearedDate: addDays(new Date(), -5),
                bankReference: 'ACH-88931238'
            };
        }
    },
    // ================= PROJECT MANAGEMENT =================
    {
        name: 'create_task',
        title: 'Create Project Task',
        description: 'Creates a task in the tracking system (Jira/Linear style).',
        department: 'Project Management',
        requiredPermissions: ['Employee', 'Manager', 'IT_Admin'],
        inputSchema: {
            title: { type: 'string', description: 'Task title', required: true },
            description: { type: 'string', description: 'Detailed ticket specification', required: true },
            assigneeName: { type: 'string', description: 'Name of the assignee', required: false },
            dueDate: { type: 'date', description: 'Target completion date (YYYY-MM-DD)', required: false },
            priority: { type: 'string', description: 'Priority level', required: false, enum: ['Low', 'Medium', 'High', 'Critical'] }
        },
        outputSchema: {
            taskId: 'string',
            status: 'string',
            assignee: 'string'
        },
        mockHandler: (params, ctx) => {
            const taskId = 'PROJ-' + Math.floor(Math.random() * 900 + 100);
            return {
                taskId,
                title: params.title,
                description: params.description,
                assignee: params.assigneeName || 'Unassigned',
                dueDate: params.dueDate || addDays(new Date(), 7),
                priority: params.priority || 'Medium',
                status: 'To Do',
                createdAt: new Date().toISOString()
            };
        }
    },
    {
        name: 'update_task',
        title: 'Update Task Status',
        description: 'Updates status, priority, or assignee for a specific project task.',
        department: 'Project Management',
        requiredPermissions: ['Employee', 'Manager'],
        inputSchema: {
            taskId: { type: 'string', description: 'Task ID (e.g. PROJ-123)', required: true },
            status: { type: 'string', description: 'New task status', required: true, enum: ['To Do', 'In Progress', 'In Review', 'Done'] }
        },
        outputSchema: {
            taskId: 'string',
            status: 'string',
            updatedAt: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                taskId: params.taskId,
                status: params.status,
                updatedAt: new Date().toISOString(),
                updatedBy: ctx.userName,
                message: `Task ${params.taskId} moved to "${params.status}".`
            };
        }
    },
    {
        name: 'sprint_status',
        title: 'Fetch Sprint Status',
        description: 'Retrieves current sprint metrics, completed story points, and active bugs.',
        department: 'Project Management',
        requiredPermissions: ['Employee', 'Manager'],
        inputSchema: {
            sprintNumber: { type: 'number', description: 'Sprint number (e.g., 24)', required: false }
        },
        outputSchema: {
            sprintName: 'string',
            completedPoints: 'number',
            remainingPoints: 'number',
            burndownStatus: 'string'
        },
        mockHandler: (params, ctx) => {
            const sprint = params.sprintNumber || 42;
            return {
                sprintId: `SPRINT-${sprint}`,
                startDate: addDays(new Date(), -8),
                endDate: addDays(new Date(), 6),
                totalStoryPoints: 85,
                completedPoints: 48,
                remainingPoints: 37,
                blockersCount: 2,
                burndownStatus: 'On Track (Ahead of ideal line by 3 points)'
            };
        }
    },
    {
        name: 'schedule_meeting',
        title: 'Schedule Calendar Meeting',
        description: 'Books a calendar event and books virtual resources.',
        department: 'Project Management',
        requiredPermissions: ['Employee', 'Manager', 'HR', 'Finance', 'IT_Admin'],
        inputSchema: {
            title: { type: 'string', description: 'Meeting title', required: true },
            meetingDate: { type: 'date', description: 'Meeting date (YYYY-MM-DD)', required: true },
            startTime: { type: 'string', description: 'Start time (e.g., 14:00)', required: true },
            durationMinutes: { type: 'number', description: 'Duration in minutes (e.g. 30, 60)', required: true }
        },
        outputSchema: {
            meetingId: 'string',
            inviteLink: 'string',
            calendarEvent: 'object'
        },
        mockHandler: (params, ctx) => {
            const meetingId = 'MTG-' + Math.random().toString(36).substring(2, 10).toUpperCase();
            const endHour = Math.floor(params.durationMinutes / 60);
            const endMin = params.durationMinutes % 60;
            const [startH, startM] = params.startTime.split(':').map(Number);
            let endHStr = String(startH + endHour).padStart(2, '0');
            let endMStr = String(startM + endMin).padStart(2, '0');
            return {
                meetingId,
                title: params.title,
                date: params.meetingDate,
                timeRange: `${params.startTime} - ${endHStr}:${endMStr}`,
                inviteLink: `https://meet.enterprise.com/${meetingId}`,
                status: 'Scheduled',
                organizer: ctx.userName
            };
        }
    },
    {
        name: 'list_calendar_events',
        title: 'List Calendar Events',
        description: 'Lists all meetings scheduled on calendar for a specific date.',
        department: 'Project Management',
        requiredPermissions: ['Employee', 'Manager', 'HR', 'Finance', 'IT_Admin'],
        inputSchema: {
            date: { type: 'date', description: 'Date to query (YYYY-MM-DD)', required: true }
        },
        outputSchema: {
            events: 'array'
        },
        mockHandler: (params, ctx) => {
            return {
                date: params.date,
                events: [
                    { time: '10:00 AM', duration: '30 mins', title: 'Daily Standup', host: 'Rahul Varma' },
                    { time: '01:30 PM', duration: '60 mins', title: 'Sprint Planning', host: ctx.userName },
                    { time: '04:00 PM', duration: '45 mins', title: '1-on-1 Sync', host: 'Amit Sharma' }
                ]
            };
        }
    },
    {
        name: 'send_meeting_invitation',
        title: 'Send Meeting Invitations',
        description: 'Sends email/calendar invites for a scheduled meeting to a list of employees.',
        department: 'Project Management',
        requiredPermissions: ['Employee', 'Manager', 'HR', 'Finance', 'IT_Admin'],
        inputSchema: {
            meetingId: { type: 'string', description: 'Scheduled meeting ID', required: true },
            recipients: { type: 'array', description: 'Comma separated list of emails or names', required: true }
        },
        outputSchema: {
            invitesSent: 'number',
            failedCount: 'number'
        },
        mockHandler: (params, ctx) => {
            const list = Array.isArray(params.recipients)
                ? params.recipients
                : String(params.recipients).split(',').map(s => s.trim());
            return {
                meetingId: params.meetingId,
                invitesSent: list.length,
                recipientsDelivered: list,
                failedCount: 0,
                status: 'Invitations Sent'
            };
        }
    },
    {
        name: 'update_project_status',
        title: 'Update Project Status Health',
        description: 'Updates the health status metrics of a key project.',
        department: 'Project Management',
        requiredPermissions: ['Manager'],
        inputSchema: {
            projectName: { type: 'string', description: 'Project name', required: true },
            healthStatus: { type: 'string', description: 'Project Health Status', required: true, enum: ['Green', 'Yellow', 'Red'] },
            summary: { type: 'string', description: 'High level status summary', required: true }
        },
        outputSchema: {
            success: 'boolean',
            updatedAt: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                projectName: params.projectName,
                healthStatus: params.healthStatus,
                summary: params.summary,
                updatedAt: new Date().toISOString(),
                author: ctx.userName,
                success: true
            };
        }
    },
    // ================= SALES DEPARTMENT =================
    {
        name: 'sales_dashboard',
        title: 'Get Sales Performance Dashboard',
        description: 'Fetches sales performance dashboards, metrics, and quotas.',
        department: 'Sales',
        requiredPermissions: ['Sales', 'Finance', 'Manager'],
        inputSchema: {},
        outputSchema: {
            quarterlyRevenue: 'number',
            targetAchieved: 'string',
            activeDealsCount: 'number'
        },
        mockHandler: (params, ctx) => {
            return {
                quarter: 'Q2 2026',
                targetQuota: '$1,200,000',
                closedWonRevenue: '$1,048,500',
                pipelineValue: '$3,400,000',
                targetAchieved: '87.4%',
                activeDealsCount: 24,
                topDeal: 'Acme Corp Enterprise License ($250k)'
            };
        }
    },
    {
        name: 'get_lead_details',
        title: 'Get Lead Details',
        description: 'Retrieves sales CRM details for a specific prospect lead.',
        department: 'Sales',
        requiredPermissions: ['Sales', 'Manager'],
        inputSchema: {
            leadId: { type: 'string', description: 'Lead ID in CRM (e.g. LEAD-882)', required: true }
        },
        outputSchema: {
            leadName: 'string',
            company: 'string',
            valueEstimate: 'number',
            stage: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                leadId: params.leadId,
                leadName: 'Arthur Dent',
                company: 'Megadodo Publications',
                email: 'arthur.d@megadodo.co.uk',
                phone: '+44 20 7946 0958',
                valueEstimate: 45000,
                stage: 'Proposal Sent',
                lastContactedDate: addDays(new Date(), -3),
                nextFollowUp: addDays(new Date(), 2)
            };
        }
    },
    {
        name: 'update_lead_status',
        title: 'Update Lead CRM Stage',
        description: 'Updates the stage of a sales lead in CRM database.',
        department: 'Sales',
        requiredPermissions: ['Sales'],
        inputSchema: {
            leadId: { type: 'string', description: 'Lead ID', required: true },
            newStage: { type: 'string', description: 'New Stage', required: true, enum: ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'] }
        },
        outputSchema: {
            success: 'boolean',
            leadId: 'string',
            stage: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                leadId: params.leadId,
                previousStage: 'Proposal',
                currentStage: params.newStage,
                updatedAt: new Date().toISOString(),
                success: true
            };
        }
    },
    {
        name: 'revenue_report',
        title: 'Generate Revenue Report',
        description: 'Generates financial revenue report grouped by product or region.',
        department: 'Sales',
        requiredPermissions: ['Sales', 'Finance', 'Manager'],
        inputSchema: {
            reportingPeriod: { type: 'string', description: 'Period (e.g. "Q1", "May 2026")', required: true }
        },
        outputSchema: {
            totalRevenue: 'number',
            breakdown: 'object'
        },
        mockHandler: (params, ctx) => {
            return {
                reportingPeriod: params.reportingPeriod,
                currency: 'USD',
                totalRevenue: 2450000,
                breakdownByRegion: {
                    NorthAmerica: 1200000,
                    EMEA: 750000,
                    APAC: 500000
                },
                breakdownByProduct: {
                    EnterpriseSaaS: 1800000,
                    ProfessionalServices: 450000,
                    SupportAddOn: 200000
                }
            };
        }
    },
    {
        name: 'customer_lookup',
        title: 'CRM Customer Lookup',
        description: 'Searches CRM databases for customer contact and contract status.',
        department: 'Sales',
        requiredPermissions: ['Sales', 'Finance', 'Manager', 'Support'],
        inputSchema: {
            companyName: { type: 'string', description: 'Name of customer organization', required: true }
        },
        outputSchema: {
            customerId: 'string',
            contractValue: 'number',
            renewalDate: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                customerId: 'CUST-88391',
                companyName: params.companyName,
                contractStatus: 'Active',
                contractValue: 120000,
                renewalDate: addDays(new Date(), 145),
                accountManager: 'Alex Smith',
                supportTier: 'Platinum 24/7'
            };
        }
    },
    // ================= MARKETING DEPARTMENT =================
    {
        name: 'campaign_report',
        title: 'Get Marketing Campaign Metrics',
        description: 'Fetches KPIs (CTR, Conversions, Spent) for active marketing campaigns.',
        department: 'Marketing',
        requiredPermissions: ['Marketing', 'Manager'],
        inputSchema: {
            campaignId: { type: 'string', description: 'Campaign ID (e.g. MKT-CAMP-99)', required: true }
        },
        outputSchema: {
            clicks: 'number',
            conversions: 'number',
            roi: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                campaignId: params.campaignId,
                campaignName: 'Summer Enterprise Cloud Promo',
                channels: ['Google Ads', 'LinkedIn Sponsored Content'],
                impressions: 450000,
                clicks: 12400,
                conversions: 310,
                amountSpent: 15000.00,
                conversionValue: 46500.00,
                roi: '3.1x',
                status: 'Active'
            };
        }
    },
    {
        name: 'social_media_analytics',
        title: 'Social Media Platform Analytics',
        description: 'Fetches engagement statistics across corporate social channels.',
        department: 'Marketing',
        requiredPermissions: ['Marketing'],
        inputSchema: {
            platformName: { type: 'string', description: 'Platform name', required: true, enum: ['LinkedIn', 'Twitter/X', 'YouTube'] }
        },
        outputSchema: {
            followersGained: 'number',
            engagementRate: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                platform: params.platformName,
                followersGained: 1420,
                impressions: 89000,
                interactions: {
                    likes: 2400,
                    shares: 540,
                    comments: 110
                },
                engagementRate: '3.4%'
            };
        }
    },
    {
        name: 'launch_email_campaign',
        title: 'Launch Email Campaign',
        description: 'Triggers marketing campaign emails to a target marketing list.',
        department: 'Marketing',
        requiredPermissions: ['Marketing'],
        inputSchema: {
            campaignTitle: { type: 'string', description: 'Title of the email campaign', required: true },
            audienceSegment: { type: 'string', description: 'Target list name (e.g., Opt-in Newsletter, Enterprise Leads)', required: true }
        },
        outputSchema: {
            emailsQueued: 'number',
            deliveryGateway: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                campaignTitle: params.campaignTitle,
                audienceSegment: params.audienceSegment,
                emailsQueued: 5400,
                deliveryGateway: 'SendGrid Production SMTP',
                status: 'Queued for Outbox',
                sendWindowStart: new Date().toISOString()
            };
        }
    },
    {
        name: 'marketing_budget',
        title: 'Get Marketing Budget Allocation',
        description: 'Retrieves budget and spending metrics for marketing quarters.',
        department: 'Marketing',
        requiredPermissions: ['Marketing', 'Finance', 'Manager'],
        inputSchema: {
            fiscalQuarter: { type: 'string', description: 'Fiscal Quarter (e.g. Q3-2026)', required: true }
        },
        outputSchema: {
            totalBudget: 'number',
            spent: 'number'
        },
        mockHandler: (params, ctx) => {
            return {
                quarter: params.fiscalQuarter,
                budgetAllocated: 150000,
                spentSoFar: 92400,
                remainingBudget: 57600,
                channelsAllocation: {
                    DigitalAds: 60000,
                    EventsAndConferences: 50000,
                    ContentCreation: 30000,
                    ToolsSubscriptions: 10000
                }
            };
        }
    },
    // ================= PROCUREMENT DEPARTMENT =================
    {
        name: 'purchase_request',
        title: 'Create Procurement Purchase Request',
        description: 'Submits a purchasing requisition for hardware, office equipment, or software licenses.',
        department: 'Procurement',
        requiredPermissions: ['Employee', 'Manager', 'HR', 'Finance', 'IT_Admin'],
        inputSchema: {
            itemName: { type: 'string', description: 'Name of product/service requested', required: true },
            unitsCount: { type: 'number', description: 'Quantity of items', required: true },
            estimatedCostPerUnit: { type: 'number', description: 'Estimated price per unit in USD', required: true },
            vendorName: { type: 'string', description: 'Preferred vendor name', required: false }
        },
        outputSchema: {
            requestNumber: 'string',
            status: 'string',
            totalCost: 'number'
        },
        mockHandler: (params, ctx) => {
            const total = params.unitsCount * params.estimatedCostPerUnit;
            return {
                requestNumber: 'PR-' + Math.floor(Math.random() * 90000 + 10000),
                itemName: params.itemName,
                quantity: params.unitsCount,
                totalCost: total,
                vendor: params.vendorName || 'Not Specified',
                status: total > 5000 ? 'Awaiting VP Finance Approval' : 'Awaiting Department Manager Approval'
            };
        }
    },
    {
        name: 'vendor_search',
        title: 'Search Approved Corporate Vendors',
        description: 'Searches database for pre-approved corporate vendors and suppliers.',
        department: 'Procurement',
        requiredPermissions: ['Employee', 'Manager', 'Procurement', 'Finance'],
        inputSchema: {
            supplyCategory: { type: 'string', description: 'Category of goods (e.g. IT Equipment, Office Stationery, SaaS, Cleaning)', required: true }
        },
        outputSchema: {
            approvedVendors: 'array'
        },
        mockHandler: (params, ctx) => {
            const category = params.supplyCategory.toLowerCase();
            const vendors = [
                { name: 'CDW Logistics', category: 'it equipment', rating: 'A+', contact: 'sales@cdw.com' },
                { name: 'Staples Business Advantage', category: 'office stationery', rating: 'A', contact: 'staples@corp.com' },
                { name: 'AWS Cloud Services', category: 'saas', rating: 'A+', contact: 'aws-sales@amazon.com' },
                { name: 'PureClean Facilities Ltd', category: 'cleaning', rating: 'B', contact: 'clean@pureclean.com' }
            ];
            const matches = vendors.filter(v => v.category.includes(category) || category.includes(v.category));
            return {
                searchCategory: params.supplyCategory,
                results: matches.length > 0 ? matches : vendors.slice(0, 2)
            };
        }
    },
    {
        name: 'create_purchase_order',
        title: 'Generate Purchase Order (PO)',
        description: 'Creates a binding Purchase Order document to send to an approved vendor.',
        department: 'Procurement',
        requiredPermissions: ['Procurement', 'Finance'],
        inputSchema: {
            vendorCode: { type: 'string', description: 'Corporate vendor code (e.g. VEND-882)', required: true },
            poItemsSummary: { type: 'string', description: 'Summary description of order items', required: true },
            totalValuation: { type: 'number', description: 'Aggregate PO amount in USD', required: true }
        },
        outputSchema: {
            poNumber: 'string',
            status: 'string'
        },
        mockHandler: (params, ctx) => {
            const poNum = 'PO-' + Math.floor(Math.random() * 90000 + 10000);
            return {
                poNumber: poNum,
                vendorCode: params.vendorCode,
                summary: params.poItemsSummary,
                totalValuation: params.totalValuation,
                status: 'PO Drafted',
                auditLog: `Created by ${ctx.userName} on ${new Date().toISOString().split('T')[0]}`
            };
        }
    },
    {
        name: 'asset_tracking',
        title: 'Track Procured Asset Status',
        description: 'Checks the shipping and delivery state of a purchased corporate asset.',
        department: 'Procurement',
        requiredPermissions: ['Employee', 'Manager', 'Procurement', 'IT_Admin'],
        inputSchema: {
            assetTagNumber: { type: 'string', description: 'Asset registration tag (e.g. AST-99212)', required: true }
        },
        outputSchema: {
            assetTag: 'string',
            shippingStatus: 'string',
            deliveryDate: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                assetTag: params.assetTagNumber,
                itemName: 'Dell UltraSharp 32" Monitor',
                carrier: 'FedEx Enterprise',
                trackingCode: '78239123891',
                shippingStatus: 'In Transit - Out for Delivery Today',
                estimatedDeliveryDate: new Date().toISOString().split('T')[0]
            };
        }
    },
    // ================= INVENTORY DEPARTMENT =================
    {
        name: 'check_stock',
        title: 'Query Inventory Stock Level',
        description: 'Retrieves current stock levels and warehouse locations for a product SKU.',
        department: 'Inventory',
        requiredPermissions: ['Employee', 'Manager', 'Procurement'],
        inputSchema: {
            itemSku: { type: 'string', description: 'Product stock-keeping unit (SKU)', required: true }
        },
        outputSchema: {
            stockLevel: 'number',
            warehouseLocation: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                sku: params.itemSku,
                itemName: 'Enterprise Laptop Charger 96W',
                currentStockLevel: 145,
                warehouseCode: 'WH-EAST-4',
                shelfLocation: 'Aisle 14, Rack B2',
                reorderThreshold: 30,
                status: 'In Stock'
            };
        }
    },
    {
        name: 'low_inventory_alert',
        title: 'Set Low Stock Threshold Alerts',
        description: 'Configures automated low inventory notifications for warehouse items.',
        department: 'Inventory',
        requiredPermissions: ['Manager', 'Procurement'],
        inputSchema: {
            itemSku: { type: 'string', description: 'Product SKU', required: true },
            alertThresholdUnits: { type: 'number', description: 'Threshold to fire notifications', required: true }
        },
        outputSchema: {
            alertId: 'string',
            status: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                alertId: 'ALT-INV-' + Math.floor(Math.random() * 900 + 100),
                sku: params.itemSku,
                threshold: params.alertThresholdUnits,
                status: 'Configured / Active',
                notificationRecipients: ['inventory-ops@enterprise.com']
            };
        }
    },
    {
        name: 'stock_transfer',
        title: 'Request Stock Warehouse Transfer',
        description: 'Submits a transfer request of stock between warehouse nodes.',
        department: 'Inventory',
        requiredPermissions: ['Manager', 'Procurement'],
        inputSchema: {
            itemSku: { type: 'string', description: 'Product SKU', required: true },
            originWarehouse: { type: 'string', description: 'Source warehouse ID', required: true },
            destinationWarehouse: { type: 'string', description: 'Target warehouse ID', required: true },
            transferUnits: { type: 'number', description: 'Quantity to transfer', required: true }
        },
        outputSchema: {
            transferId: 'string',
            status: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                transferId: 'TRF-' + Math.floor(Math.random() * 9000 + 1000),
                sku: params.itemSku,
                origin: params.originWarehouse,
                destination: params.destinationWarehouse,
                unitsCount: params.transferUnits,
                status: 'Authorized - Preparing Dispatch',
                etaHours: 36
            };
        }
    },
    {
        name: 'warehouse_status',
        title: 'Check Warehouse Capacity Status',
        description: 'Fetches capacity limits, occupied zones, and staff levels of a warehouse.',
        department: 'Inventory',
        requiredPermissions: ['Manager', 'Procurement'],
        inputSchema: {
            warehouseId: { type: 'string', description: 'Warehouse ID (e.g. WH-WEST)', required: true }
        },
        outputSchema: {
            totalCapacitySqm: 'number',
            occupiedPercentage: 'string',
            staffOnShift: 'number'
        },
        mockHandler: (params, ctx) => {
            return {
                warehouseId: params.warehouseId,
                location: 'Oakland, California',
                totalCapacitySqm: 15000,
                occupiedPercentage: '78.2%',
                temperatureControlStatus: 'Normal (18°C)',
                staffOnShift: 24,
                operationalStatus: 'Open - Running normally'
            };
        }
    },
    // ================= LEGAL DEPARTMENT =================
    {
        name: 'policy_search',
        title: 'Search Legal & HR Policies',
        description: 'Performs semantic policy searches in corporate bylaws, handbooks, and compliance rules.',
        department: 'Legal',
        requiredPermissions: ['Employee', 'Manager', 'HR', 'Finance', 'IT_Admin'],
        inputSchema: {
            searchTopic: { type: 'string', description: 'Topic or keyword (e.g. Maternity Leave, Travel Expenses, Remote Work)', required: true }
        },
        outputSchema: {
            matchingPolicies: 'array'
        },
        mockHandler: (params, ctx) => {
            const topic = params.searchTopic.toLowerCase();
            const policies = [
                { title: 'Employee Remote Work Policy (POL-108)', snippet: 'Full-time employees are eligible for up to 3 days remote work per week, subject to manager approval.' },
                { title: 'Corporate Code of Conduct (POL-001)', snippet: 'Zero tolerance policy for workplace harassment, bribery, or intellectual property leaks.' },
                { title: 'Travel & Expense Policy (POL-240)', snippet: 'Daily meals limit is capped at $75/day. Hotel stays require booking through the corporate portal.' },
                { title: 'Leave & Attendance Policy (POL-115)', snippet: 'Casual leaves must be applied at least 48 hours in advance. Sick leave requires medical certificate if >3 consecutive days.' }
            ];
            const matches = policies.filter(p => p.title.toLowerCase().includes(topic) || p.snippet.toLowerCase().includes(topic));
            return {
                searchTopic: params.searchTopic,
                results: matches.length > 0 ? matches : policies.slice(0, 2)
            };
        }
    },
    {
        name: 'generate_nda',
        title: 'Generate Non-Disclosure Agreement (NDA)',
        description: 'Generates standard corporate NDA documents for vendors or new clients.',
        department: 'Legal',
        requiredPermissions: ['Employee', 'Manager', 'HR', 'Finance', 'Sales'],
        inputSchema: {
            counterpartyName: { type: 'string', description: 'Legal name of counterparty company/individual', required: true },
            ndaDurationYears: { type: 'number', description: 'Duration of confidentiality (e.g. 3, 5)', required: true }
        },
        outputSchema: {
            ndaId: 'string',
            downloadUrl: 'string'
        },
        mockHandler: (params, ctx) => {
            const ndaId = 'NDA-2026-' + Math.floor(Math.random() * 9000 + 1000);
            return {
                ndaId,
                counterparty: params.counterpartyName,
                durationYears: params.ndaDurationYears,
                signeeForCorp: ctx.userName,
                status: 'Document Drafted - Ready for Signature',
                downloadUrl: `/api/legal/nda/${ndaId}/download`,
                instructions: 'Please sign via DocuSign link sent to counterparty email.'
            };
        }
    },
    {
        name: 'submit_contract_review',
        title: 'Submit Contract for Legal Review',
        description: 'Uploads external contracts or lease agreements for corporate legal team vetting.',
        department: 'Legal',
        requiredPermissions: ['Manager', 'Finance', 'Sales'],
        inputSchema: {
            contractTitle: { type: 'string', description: 'Title or purpose of the agreement', required: true },
            vendorPartnerName: { type: 'string', description: 'Name of the partner organization', required: true }
        },
        outputSchema: {
            ticketNumber: 'string',
            status: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                ticketNumber: 'LGL-REV-' + Math.floor(Math.random() * 90000 + 10000),
                contractTitle: params.contractTitle,
                partner: params.vendorPartnerName,
                submittedDate: new Date().toISOString().split('T')[0],
                status: 'Queued for Review',
                slaTurnaroundTime: '5 Business Days'
            };
        }
    },
    {
        name: 'compliance_report',
        title: 'Get Compliance Audit Status',
        description: 'Retrieves general corporate compliance dashboard logs.',
        department: 'Legal',
        requiredPermissions: ['Manager', 'HR', 'Finance'],
        inputSchema: {
            complianceYear: { type: 'number', description: 'Year to retrieve compliance logs', required: true }
        },
        outputSchema: {
            riskLevel: 'string',
            trainingCompletionRate: 'string',
            complianceScore: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                year: params.complianceYear,
                auditDate: addDays(new Date(), -15),
                overallComplianceScore: '96.8%',
                riskLevel: 'Low / Satisfactory',
                trainingCompletionRate: {
                    AntiBribery: '98.5%',
                    DataPrivacyGDPR: '94.2%',
                    WorkplaceHarassment: '100%'
                },
                auditFindingsCount: 0
            };
        }
    },
    // ================= CUSTOMER SUPPORT =================
    {
        name: 'get_customer_tickets',
        title: 'Get Customer Support Tickets',
        description: 'Retrieves active and historical customer support requests from Zendesk/Salesforce.',
        department: 'Customer Support',
        requiredPermissions: ['Support', 'Sales', 'Manager'],
        inputSchema: {
            customerCompanyName: { type: 'string', description: 'Client company name', required: true }
        },
        outputSchema: {
            ticketsList: 'array'
        },
        mockHandler: (params, ctx) => {
            return {
                customer: params.customerCompanyName,
                activeTicketsCount: 2,
                ticketsList: [
                    { id: 'TIK-9812', subject: 'API endpoint latency increases', priority: 'High', status: 'Open', openedDate: addDays(new Date(), -1) },
                    { id: 'TIK-9710', subject: 'Billing billing discrepancies on invoice INV-2026-101', priority: 'Medium', status: 'Resolved', openedDate: addDays(new Date(), -10) }
                ]
            };
        }
    },
    {
        name: 'escalate_ticket',
        title: 'Escalate Priority Support Ticket',
        description: 'Escalates an unresolved critical customer support ticket to L3 Engineering.',
        department: 'Customer Support',
        requiredPermissions: ['Support', 'Manager'],
        inputSchema: {
            ticketNumber: { type: 'string', description: 'Support ticket number (e.g. TIK-9812)', required: true },
            escalationReason: { type: 'string', description: 'Justification for escalation', required: true }
        },
        outputSchema: {
            ticketId: 'string',
            escalatedStatus: 'string',
            notifiedParties: 'array'
        },
        mockHandler: (params, ctx) => {
            return {
                ticketId: params.ticketNumber,
                previousSlaTier: 'L2 Support Desk',
                currentSlaTier: 'L3 Engineering Escalation Group',
                escalationReason: params.escalationReason,
                status: 'Escalated - Under Dev Team Review',
                notifiedParties: ['Engineering Leads', 'Account Executive'],
                timestamp: new Date().toISOString()
            };
        }
    },
    {
        name: 'search_knowledge_base',
        title: 'Search Support Knowledge Base',
        description: 'Searches the customer knowledge base articles for troubleshooting FAQs.',
        department: 'Customer Support',
        requiredPermissions: ['Employee', 'Manager', 'Support'],
        inputSchema: {
            searchQuery: { type: 'string', description: 'Search keywords', required: true }
        },
        outputSchema: {
            articles: 'array'
        },
        mockHandler: (params, ctx) => {
            return {
                searchQuery: params.searchQuery,
                articles: [
                    { title: 'Troubleshooting SSO Login Errors', url: '/kb/sso-login-errors', rating: '4.8/5' },
                    { title: 'Setting up API OAuth Integration Credentials', url: '/kb/api-oauth-credentials', rating: '4.5/5' }
                ]
            };
        }
    },
    {
        name: 'customer_satisfaction_score',
        title: 'Get Team CSAT Scores',
        description: 'Fetches historical Customer Satisfaction (CSAT) analytics and response SLAs.',
        department: 'Customer Support',
        requiredPermissions: ['Manager', 'Support'],
        inputSchema: {
            reportingPeriod: { type: 'string', description: 'Month/Quarter for score analysis', required: true }
        },
        outputSchema: {
            averageCsatPercentage: 'number',
            firstResponseTimeMinutes: 'number'
        },
        mockHandler: (params, ctx) => {
            return {
                reportingPeriod: params.reportingPeriod,
                averageCsatPercentage: 94.5,
                firstResponseTimeMinutes: 12,
                resolutionTimeHours: 4.2,
                totalSurveysCompleted: 1450,
                npsScore: 68
            };
        }
    },
    // ================= OPERATIONS =================
    {
        name: 'dispatch_order',
        title: 'Dispatch Customer Order',
        description: 'Flags a prepared warehouse order as dispatched and notifies carriers.',
        department: 'Operations',
        requiredPermissions: ['Manager', 'Procurement'],
        inputSchema: {
            customerOrderId: { type: 'string', description: 'Order ID to dispatch', required: true }
        },
        outputSchema: {
            success: 'boolean',
            shipmentId: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                orderId: params.customerOrderId,
                shipmentId: 'SHP-' + Math.floor(Math.random() * 900000 + 100000),
                carrierBooked: 'DHL Express',
                status: 'Dispatched / Carrier Pickup Logged',
                success: true
            };
        }
    },
    {
        name: 'track_shipment',
        title: 'Track Cargo Shipment',
        description: 'Fetches real-time freight and cargo tracking logs.',
        department: 'Operations',
        requiredPermissions: ['Employee', 'Manager', 'Procurement'],
        inputSchema: {
            shipmentTrackingCode: { type: 'string', description: 'Carrier tracking code', required: true }
        },
        outputSchema: {
            status: 'string',
            currentLocation: 'string',
            eta: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                trackingCode: params.shipmentTrackingCode,
                carrier: 'FedEx Cargo',
                currentStatus: 'Customs Clearance In Progress',
                currentLocation: 'Port of Rotterdam, NL',
                estimatedDeliveryDate: addDays(new Date(), 5),
                checkpointHistory: [
                    { time: addDays(new Date(), -2), location: 'Port of Shanghai, CN', event: 'Container Loaded' }
                ]
            };
        }
    },
    {
        name: 'delivery_schedule',
        title: 'Get Courier Delivery Schedule',
        description: 'Lists scheduled courier pickups and drop-offs for the corporate office.',
        department: 'Operations',
        requiredPermissions: ['Employee', 'Manager', 'Procurement'],
        inputSchema: {
            scheduleDate: { type: 'date', description: 'Target date (YYYY-MM-DD)', required: true }
        },
        outputSchema: {
            schedules: 'array'
        },
        mockHandler: (params, ctx) => {
            return {
                date: params.scheduleDate,
                pickups: [
                    { carrier: 'UPS', time: '11:00 AM', itemsCount: 4, status: 'Scheduled' },
                    { carrier: 'FedEx', time: '03:30 PM', itemsCount: 1, status: 'Scheduled' }
                ],
                dropoffs: [
                    { sender: 'Staples Business', time: '09:30 AM', details: 'Office Supplies Box', status: 'Delivered' }
                ]
            };
        }
    },
    // ================= ANALYTICS =================
    {
        name: 'kpi_dashboard',
        title: 'Get Executive KPI Metrics',
        description: 'Fetches high-level corporate KPI metrics (ARR, CAC, LTV) for executive review.',
        department: 'Analytics',
        requiredPermissions: ['Manager', 'Finance'],
        inputSchema: {},
        outputSchema: {
            annualRecurringRevenue: 'number',
            churnRate: 'string',
            customerAcquisitionCost: 'number'
        },
        mockHandler: (params, ctx) => {
            return {
                asOfDate: new Date().toISOString().split('T')[0],
                annualRecurringRevenue: 24500000,
                monthlyRecurringRevenue: 2041000,
                churnRate: '2.1%',
                customerAcquisitionCost: 4500,
                customerLifetimeValue: 28000,
                ltvToCacRatio: '6.2x',
                headcountTotal: 450
            };
        }
    },
    {
        name: 'business_report',
        title: 'Generate Business Operation Report',
        description: 'Triggers long-running analytical report compilation for a department.',
        department: 'Analytics',
        requiredPermissions: ['Manager', 'Finance', 'HR'],
        inputSchema: {
            targetDepartmentName: { type: 'string', description: 'Department Name', required: true },
            reportCategory: { type: 'string', description: 'Report Category', required: true, enum: ['Operational Efficiency', 'Resource Utilization', 'Cost Center Breakdown'] }
        },
        outputSchema: {
            jobId: 'string',
            status: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                jobId: 'JOB-ANL-' + Math.floor(Math.random() * 90000 + 10000),
                targetDepartment: params.targetDepartmentName,
                category: params.reportCategory,
                status: 'Generating (Async Background Task)',
                estimatedExecutionTimeSeconds: 45,
                downloadEndpoint: `/api/analytics/jobs/download?jobId=JOB-ANL`
            };
        }
    },
    {
        name: 'employee_analytics',
        title: 'Get Workforce Headcount Analytics',
        description: 'Fetches headcount changes, employee churn rates, and hiring funnel status.',
        department: 'Analytics',
        requiredPermissions: ['HR', 'Manager'],
        inputSchema: {
            analyticsYear: { type: 'number', description: 'Reporting fiscal year', required: true }
        },
        outputSchema: {
            attritionRate: 'string',
            activeHeadcount: 'number',
            hiringFunnelCount: 'number'
        },
        mockHandler: (params, ctx) => {
            return {
                year: params.analyticsYear,
                activeHeadcount: 450,
                attritionRate: '4.8% (Below industry average of 8%)',
                hiringFunnelCount: {
                    applicationsReceived: 1200,
                    interviewsScheduled: 84,
                    offersExtended: 12,
                    offersAccepted: 9
                },
                averageTenureYears: 3.4
            };
        }
    },
    {
        name: 'revenue_analytics',
        title: 'Get Revenue Projection Forecast',
        description: 'Generates statistical predictive revenue models based on past records.',
        department: 'Analytics',
        requiredPermissions: ['Finance', 'Manager'],
        inputSchema: {
            forecastMonthsLimit: { type: 'number', description: 'Number of months forward to project (1-12)', required: true }
        },
        outputSchema: {
            predictedArrGrowth: 'string',
            projectionDataPoints: 'array'
        },
        mockHandler: (params, ctx) => {
            const data = [];
            const baseArr = 24.5; // Millions
            for (let i = 1; i <= params.forecastMonthsLimit; i++) {
                data.push({
                    month: `Month +${i}`,
                    estimatedArrMillions: +(baseArr + (i * 0.4) + (Math.random() * 0.1)).toFixed(2)
                });
            }
            return {
                projectionMonths: params.forecastMonthsLimit,
                predictedArrGrowth: '+12.4% Annualized YoY',
                confidenceInterval: '95% (Lower: $25M, Upper: $27.4M)',
                projectionDataPoints: data
            };
        }
    },
    // ================= SECURITY =================
    {
        name: 'report_phishing',
        title: 'Report Phishing Email',
        description: 'Submits details of a suspicious email to the SecOps incident review queue.',
        department: 'Security',
        requiredPermissions: ['Employee', 'Manager', 'HR', 'Finance', 'IT_Admin'],
        inputSchema: {
            senderEmailAddress: { type: 'string', description: 'The email address of the suspicious sender', required: true },
            emailSubjectLine: { type: 'string', description: 'Subject line of the email', required: true },
            emailBodySnippet: { type: 'string', description: 'A small snippet of the message body text', required: false }
        },
        outputSchema: {
            incidentId: 'string',
            threatAssessmentScore: 'string'
        },
        mockHandler: (params, ctx) => {
            const score = Math.floor(Math.random() * 90 + 10);
            return {
                incidentId: 'SEC-INC-' + Math.floor(Math.random() * 90000 + 10000),
                reportedBy: ctx.userName,
                sender: params.senderEmailAddress,
                subject: params.emailSubjectLine,
                threatAssessmentScore: `${score}/100`,
                urgency: score > 70 ? 'High - Immediate Quarantine Triggered' : 'Medium - Queued for Analyst Vetting',
                status: 'Logged'
            };
        }
    },
    {
        name: 'request_mfa_reset',
        title: 'Reset Multi-Factor Auth (MFA)',
        description: 'Triggers reset process for Okta/Microsoft Authenticator hardware tokens.',
        department: 'Security',
        requiredPermissions: ['IT_Admin'],
        inputSchema: {
            targetUsername: { type: 'string', description: 'Employee username to reset MFA', required: true }
        },
        outputSchema: {
            success: 'boolean',
            resetToken: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                targetUser: params.targetUsername,
                success: true,
                resetToken: 'MFA-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
                expiryMinutes: 10,
                instructions: 'Send the temporary reset token to the user via out-of-band communication (SMS/Call).'
            };
        }
    },
    {
        name: 'access_log_review',
        title: 'Review System Access Logs',
        description: 'Queries authentication access logs for target servers and IP endpoints.',
        department: 'Security',
        requiredPermissions: ['IT_Admin'],
        inputSchema: {
            serverHostname: { type: 'string', description: 'Domain or hostname to review logs (e.g. prod-db-01)', required: true },
            lookbackHours: { type: 'number', description: 'Hours of logs to scan (1-24)', required: true }
        },
        outputSchema: {
            logEntries: 'array'
        },
        mockHandler: (params, ctx) => {
            return {
                host: params.serverHostname,
                scanWindowHours: params.lookbackHours,
                totalAttempts: 120,
                failedAttemptsCount: 2,
                logEntries: [
                    { timestamp: new Date().toISOString(), user: 'admin', ip: '10.145.2.14', event: 'Successful SSH Login', authMethod: 'SSH Key' },
                    { timestamp: addDays(new Date(), -0.1).toString(), user: 'root', ip: '192.168.99.1', event: 'Failed Password SSH Attempt', authMethod: 'Password' }
                ]
            };
        }
    },
    {
        name: 'security_alert_status',
        title: 'Check Corporate Threat Alert Status',
        description: 'Fetches security status regarding firewalls, endpoints, and active cyber attacks.',
        department: 'Security',
        requiredPermissions: ['IT_Admin'],
        inputSchema: {},
        outputSchema: {
            corporateThreatLevel: 'string',
            activeIncidentsCount: 'number'
        },
        mockHandler: (params, ctx) => {
            return {
                timestamp: new Date().toISOString(),
                corporateThreatLevel: 'GREEN - NORMAL OPERATIONS',
                activeIncidentsCount: 0,
                firewallHealth: '99.99%',
                blockedScansLast24Hours: 1284500,
                complianceAlerts: 'All clean'
            };
        }
    },
    // ================= FACILITIES =================
    {
        name: 'book_conference_room',
        title: 'Book Conference Room',
        description: 'Reserves a physical conference room for a specific date and time.',
        department: 'Facilities',
        requiredPermissions: ['Employee', 'Manager', 'HR', 'Finance', 'IT_Admin'],
        inputSchema: {
            roomName: { type: 'string', description: 'Room name', required: true, enum: ['Boardroom A', 'Ada Lovelace Suite', 'Alan Turing Lab', 'Conference Room 2B', 'Huddle Room 4'] },
            bookingDate: { type: 'date', description: 'Date of booking (YYYY-MM-DD)', required: true },
            startTime: { type: 'string', description: 'Start time (e.g. 14:00)', required: true },
            durationHours: { type: 'number', description: 'Duration in hours (e.g. 1, 2)', required: true }
        },
        outputSchema: {
            bookingId: 'string',
            status: 'string',
            roomConfirmed: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                bookingId: 'BKG-ROOM-' + Math.floor(Math.random() * 9000 + 1000),
                roomConfirmed: params.roomName,
                date: params.bookingDate,
                timeSlot: `${params.startTime} for ${params.durationHours} hr(s)`,
                bookedBy: ctx.userName,
                status: 'Confirmed',
                features: 'Equipped with Apple TV, Jabra Meet, whiteboard'
            };
        }
    },
    {
        name: 'report_facility_issue',
        title: 'Report Facilities Maintenance Issue',
        description: 'Logs a maintenance ticket for physical premises (AC issue, lightbulb, cleanup).',
        department: 'Facilities',
        requiredPermissions: ['Employee', 'Manager', 'HR', 'Finance', 'IT_Admin'],
        inputSchema: {
            issueLocation: { type: 'string', description: 'Building/Floor/Desk number (e.g. Floor 4, Suite 402)', required: true },
            issueDescription: { type: 'string', description: 'Description of problem (e.g., AC leaking, water dispenser empty)', required: true }
        },
        outputSchema: {
            maintenanceTicketId: 'string',
            status: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                ticketId: 'FAC-' + Math.floor(Math.random() * 90000 + 10000),
                location: params.issueLocation,
                description: params.issueDescription,
                status: 'Logged - Assigned to Building Facilities Staff',
                priority: 'Medium',
                estimatedResolution: 'Within 4 Hours'
            };
        }
    },
    {
        name: 'visitor_pass',
        title: 'Request Building Visitor Pass',
        description: 'Pre-registers office visitors and generates physical building access badges.',
        department: 'Facilities',
        requiredPermissions: ['Employee', 'Manager', 'HR', 'Finance', 'IT_Admin'],
        inputSchema: {
            visitorFullName: { type: 'string', description: 'Full name of guest', required: true },
            visitDate: { type: 'date', description: 'Date of visit (YYYY-MM-DD)', required: true },
            hostReason: { type: 'string', description: 'Brief purpose of the visit', required: true }
        },
        outputSchema: {
            passCode: 'string',
            status: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                passCode: 'VP-' + Math.floor(Math.random() * 89999 + 10000),
                visitorName: params.visitorFullName,
                hostName: ctx.userName,
                visitDate: params.visitDate,
                status: 'Pre-registered',
                instructions: 'Instruct visitor to present photo ID at the reception lobby to print the badge.'
            };
        }
    },
    // ================= ADMINISTRATION =================
    {
        name: 'office_supplies_request',
        title: 'Request Office Stationery Supplies',
        description: 'Requests physical office assets (notebooks, pens, markers, whiteboards).',
        department: 'Administration',
        requiredPermissions: ['Employee', 'Manager', 'HR', 'Finance', 'IT_Admin'],
        inputSchema: {
            itemsList: { type: 'string', description: 'List of stationery items requested (e.g., 2 Notebooks, Pack of Blue Pens)', required: true }
        },
        outputSchema: {
            status: 'string',
            deliveryEstimate: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                requestedBy: ctx.userName,
                itemsRequested: params.itemsList,
                status: 'Approved - Preparing Dispatch',
                deliveryEstimate: 'Delivered to your desk by 04:00 PM Today',
                dispatchHub: 'Main Office Supply Desk'
            };
        }
    },
    {
        name: 'courier_request',
        title: 'Book Courier Dispatch',
        description: 'Requests courier dispatch for outbound corporate files or packages.',
        department: 'Administration',
        requiredPermissions: ['Employee', 'Manager', 'HR', 'Finance'],
        inputSchema: {
            recipientName: { type: 'string', description: 'Recipient Name', required: true },
            shippingAddress: { type: 'string', description: 'Full destination address', required: true },
            approxWeightKg: { type: 'number', description: 'Approximate weight in Kg', required: true }
        },
        outputSchema: {
            consignmentNumber: 'string',
            carrierName: 'string'
        },
        mockHandler: (params, ctx) => {
            return {
                consignmentNumber: 'CON-' + Math.floor(Math.random() * 9000000 + 1000000),
                recipient: params.recipientName,
                destination: params.shippingAddress,
                carrierName: 'FedEx Document Express',
                serviceType: 'Priority Next-Day',
                estimatedPickupTime: 'Today, 02:00 PM'
            };
        }
    },
    {
        name: 'office_parking_slot',
        title: 'Reserve Office Parking Slot',
        description: 'Books an office basement parking slot for a vehicle license plate number.',
        department: 'Administration',
        requiredPermissions: ['Manager', 'HR', 'Finance', 'IT_Admin'],
        inputSchema: {
            licensePlateNumber: { type: 'string', description: 'Vehicle plate number (e.g. 7XYZ99)', required: true },
            reservationDate: { type: 'date', description: 'Booking date (YYYY-MM-DD)', required: true }
        },
        outputSchema: {
            parkingSlotCode: 'string',
            status: 'string'
        },
        mockHandler: (params, ctx) => {
            const slot = 'B2-' + Math.floor(Math.random() * 50 + 1);
            return {
                vehiclePlate: params.licensePlateNumber,
                date: params.reservationDate,
                parkingSlotCode: slot,
                location: 'Basement Level 2, Zone C',
                status: 'Reserved',
                instructions: 'Scan your employee badge at the gate to activate the license plate recognition camera.'
            };
        }
    }
];
// Helper to find a tool by name
export const getToolByName = (name) => {
    return toolsRegistry.find(t => t.name === name);
};
