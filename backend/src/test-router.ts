import { runLocalRouter } from './router.js';

interface TestScenario {
  query: string;
  expectedDepartment: string;
  expectedTools: string[];
}

const testScenarios: TestScenario[] = [
  {
    query: "Show my leave balance",
    expectedDepartment: "Human Resources",
    expectedTools: ["leave_balance"]
  },
  {
    query: "Apply for 2 days leave starting tomorrow",
    expectedDepartment: "Human Resources",
    expectedTools: ["apply_leave"]
  },
  {
    query: "I forgot my VPN password",
    expectedDepartment: "Information Technology",
    expectedTools: ["reset_vpn_password"]
  },
  {
    query: "Schedule a meeting tomorrow with the team at 14:00 and send invitations to Priya and Rahul",
    expectedDepartment: "Project Management",
    expectedTools: ["schedule_meeting", "send_meeting_invitation"]
  },
  {
    query: "Generate guest wifi access for Rohit for 2 days",
    expectedDepartment: "Information Technology",
    expectedTools: ["wifi_guest_access"]
  },
  {
    query: "Check IT ticket status for INC-482912",
    expectedDepartment: "Information Technology",
    expectedTools: ["get_ticket_status"]
  },
  {
    query: "Submit reimbursement of $45 for Travel on 2026-07-15",
    expectedDepartment: "Finance",
    expectedTools: ["submit_reimbursement"]
  }
];

const runTests = () => {
  console.log("=== RUNNING LOCAL ROUTER SEMANTIC VERIFICATION TESTS ===");
  let passedCount = 0;

  for (const [idx, scenario] of testScenarios.entries()) {
    console.log(`\nTest #${idx + 1}: "${scenario.query}"`);
    try {
      const output = runLocalRouter(scenario.query, [], 'Employee');
      
      const routedTools = output.toolCalls.map(t => t.toolName);
      
      const deptMatches = output.department === scenario.expectedDepartment;
      const toolsMatch = JSON.stringify(routedTools) === JSON.stringify(scenario.expectedTools);
      
      console.log(`  Routed Department: "${output.department}" (Expected: "${scenario.expectedDepartment}") -> ${deptMatches ? '✅' : '❌'}`);
      console.log(`  Routed Tools: [${routedTools.join(', ')}] (Expected: [${scenario.expectedTools.join(', ')}]) -> ${toolsMatch ? '✅' : '❌'}`);
      
      if (output.toolCalls.length > 0) {
        console.log(`  Extracted Params:`, JSON.stringify(output.toolCalls[0].parameters));
      }

      if (deptMatches && toolsMatch) {
        passedCount++;
      } else {
        console.log("  ⚠️ Test Failed specifications.");
      }
    } catch (e: any) {
      console.error(`  ❌ Error processing:`, e.message);
    }
  }

  console.log(`\n=== SCENARIO VERIFICATION COMPLETED: ${passedCount}/${testScenarios.length} PASSED ===`);
  process.exit(passedCount === testScenarios.length ? 0 : 1);
};

runTests();
