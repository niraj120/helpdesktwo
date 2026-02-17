import { UserIcon, TicketIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

interface TeamMemberStats {
  userId: string;
  name: string;
  email: string;
  stats: {
    total: number;
    pending: number;
    resolved: number;
    closed: number;
    highPriority: number;
    mediumPriority: number;
    lowPriority: number;
  };
}

interface TeamBreakdownProps {
  teamMembers: TeamMemberStats[];
  loading?: boolean;
  onMemberClick?: (userId: string) => void;
}

/**
 * TeamBreakdown Component
 * 
 * Displays a table showing individual ticket statistics for each team member
 * Visible only when user has DASHBOARD_VIEW_TEAM_BREAKDOWN permission
 */
const TeamBreakdown: React.FC<TeamBreakdownProps> = ({
  teamMembers,
  loading = false,
  onMemberClick,
}) => {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4 py-1">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!teamMembers || teamMembers.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <div className="text-center text-gray-500">
          <UserIcon className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm">No team members found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <UserIcon className="h-5 w-5 text-gray-600" />
          Team Member Breakdown
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Individual ticket statistics for each team member
        </p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Team Member
              </th>
              <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total
              </th>
              <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Pending
              </th>
              <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Resolved
              </th>
              <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Closed
              </th>
              <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                High
              </th>
              <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Medium
              </th>
              <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Low
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {teamMembers.map((member, index) => (
              <tr
                key={member.userId}
                onClick={() => onMemberClick?.(member.userId)}
                className={`
                  ${onMemberClick ? 'cursor-pointer hover:bg-gray-50' : ''}
                  ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                  transition-colors duration-150
                `}
              >
                {/* Team Member Info */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                      <span className="text-white font-semibold text-sm">
                        {member.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">{member.name}</div>
                      <div className="text-sm text-gray-500">{member.email}</div>
                    </div>
                  </div>
                </td>

                {/* Total */}
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <div className="flex items-center justify-center gap-1">
                    <TicketIcon className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-semibold text-gray-900">{member.stats.total}</span>
                  </div>
                </td>

                {/* Pending */}
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    {member.stats.pending}
                  </span>
                </td>

                {/* Resolved */}
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <div className="flex items-center justify-center gap-1">
                    <CheckCircleIcon className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium text-green-600">{member.stats.resolved}</span>
                  </div>
                </td>

                {/* Closed */}
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <div className="flex items-center justify-center gap-1">
                    <XCircleIcon className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-600">{member.stats.closed}</span>
                  </div>
                </td>

                {/* High Priority */}
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    {member.stats.highPriority}
                  </span>
                </td>

                {/* Medium Priority */}
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                    {member.stats.mediumPriority}
                  </span>
                </td>

                {/* Low Priority */}
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {member.stats.lowPriority}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>

          {/* Summary Row */}
          <tfoot className="bg-gray-100 border-t-2 border-gray-300">
            <tr>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                Total ({teamMembers.length} members)
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-900">
                {teamMembers.reduce((sum, m) => sum + m.stats.total, 0)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-900">
                {teamMembers.reduce((sum, m) => sum + m.stats.pending, 0)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-green-600">
                {teamMembers.reduce((sum, m) => sum + m.stats.resolved, 0)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-600">
                {teamMembers.reduce((sum, m) => sum + m.stats.closed, 0)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-red-600">
                {teamMembers.reduce((sum, m) => sum + m.stats.highPriority, 0)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-orange-600">
                {teamMembers.reduce((sum, m) => sum + m.stats.mediumPriority, 0)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-blue-600">
                {teamMembers.reduce((sum, m) => sum + m.stats.lowPriority, 0)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default TeamBreakdown;
