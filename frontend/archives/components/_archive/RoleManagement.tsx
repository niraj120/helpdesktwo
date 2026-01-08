/**
 * ⚠️ DEPRECATED - DO NOT USE
 * 
 * This component has been REPLACED by: src/pages/RBACSetup.tsx
 * 
 * Reason: RBACSetup provides comprehensive role management with:
 * - Master role templates
 * - Role cloning functionality
 * - Module-wise permission organization
 * - Project mapping
 * 
 * This file is kept for reference only and should be archived/deleted.
 * Last active: Before RBACSetup implementation
 * 
 * @deprecated Use RBACSetup instead
 */

import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface Permission {
	_id: string;
	name: string;
	category: string;
	description?: string;
}

interface Role {
	_id: string;
	name: string;
	permissions: Permission[];
}

const RoleManagement: React.FC = () => {
	const [roles, setRoles] = useState<Role[]>([]);
	const [permissions, setPermissions] = useState<Permission[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fetchData = async () => {
			setLoading(true);
			setError(null);
			try {
				const [rolesRes, permissionsRes] = await Promise.all([
					axios.get('/api/roles'),
					axios.get('/api/permissions'),
				]);
				setRoles(rolesRes.data);
				setPermissions(permissionsRes.data);
			} catch (err: any) {
				setError(err.message || 'Failed to fetch data');
			} finally {
				setLoading(false);
			}
		};
		fetchData();
	}, []);

	if (loading) return <div>Loading roles and permissions...</div>;
	if (error) return <div className="text-red-500">Error: {error}</div>;

	return (
		<div className="p-8">
			<h1 className="text-2xl font-bold mb-4">Role Management</h1>
			<h2 className="text-xl font-semibold mt-6 mb-2">Roles</h2>
			<ul className="mb-8">
				{roles.map((role) => (
					<li key={role._id} className="mb-2">
						<span className="font-medium">{role.name}</span> ({role.permissions.length} permissions)
					</li>
				))}
			</ul>
			<h2 className="text-xl font-semibold mb-2">All Permissions</h2>
			<ul>
				{permissions.map((perm) => (
					<li key={perm._id} className="mb-1">
						<span className="font-medium">{perm.name}</span> <span className="text-gray-500">[{perm.category}]</span>
						{perm.description && <span className="ml-2 text-gray-400">- {perm.description}</span>}
					</li>
				))}
			</ul>
		</div>
	);
};

export default RoleManagement;
