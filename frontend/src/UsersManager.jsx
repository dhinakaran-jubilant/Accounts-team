/**
 * Project: Accounts Team
 * Component: UsersManager
 * Author: Dhinakaran Sekar
 * Email: dhinakaran.s@jubilantenterprises.in
 * Date: 2026-04-08 11:53:28
 */
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const UsersManager = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(null); // stores user object to delete
    const [formData, setFormData] = useState({
        employee_code: '',
        name: '',
        email: '',
        password: '',
        role: 'user',
        permissions: []
    });
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editingUserId, setEditingUserId] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 8;

    const API_URL = '/api';

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API_URL}/users`);
            const data = await res.json();
            if (data.success) {
                setUsers(data.users);
            }
        } catch (err) {
            console.error('Error fetching users:', err);
            setError('Failed to load users.');
        } finally {
            setLoading(false);
        }
    };

    const togglePermission = (perm) => {
        setFormData(prev => ({
            ...prev,
            permissions: prev.permissions.includes(perm)
                ? prev.permissions.filter(p => p !== perm)
                : [...prev.permissions, perm]
        }));
    };

    const handleAddUser = async (e) => {
        e.preventDefault();
        try {
            setError(null);
            const res = await fetch(`${API_URL}/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const data = await res.json();
            if (data.success) {
                fetchUsers();
                setSuccess(`User ${formData.employee_code} added successfully!`);
                handleCloseModal();
            } else {
                setError(data.message || 'Failed to add user.');
            }
        } catch (err) {
            setError('Failed to add user.');
        }
    };

    const handleUpdateUser = async (e) => {
        e.preventDefault();
        if (!editingUserId) return;
        try {
            setError(null);
            const res = await fetch(`${API_URL}/users/${editingUserId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const data = await res.json();
            if (data.success) {
                fetchUsers();
                setSuccess(`User ${formData.employee_code} updated successfully!`);
                handleCloseModal();
            } else {
                setError(data.message || 'Failed to update user.');
            }
        } catch (err) {
            setError('Failed to update user.');
        }
    };

    const handleEditClick = (u) => {
        setFormData({
            employee_code: u.employee_code,
            name: u.name,
            email: u.email || '',
            password: '', // Don't pre-fill password for security
            role: u.role || 'user',
            permissions: u.permissions || []
        });
        setEditingUserId(u.id);
        setIsEditing(true);
        setShowAddModal(true);
    };

    const handleCloseModal = () => {
        setShowAddModal(false);
        setIsEditing(false);
        setEditingUserId(null);
        setFormData({
            employee_code: '',
            name: '',
            email: '',
            password: '',
            role: 'user',
            permissions: []
        });
        setError(null);
    };

    const handleDeleteUser = async () => {
        if (!showDeleteModal) return;
        try {
            const res = await fetch(`${API_URL}/users/${showDeleteModal.id}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                setSuccess('User deleted successfully.');
                setShowDeleteModal(null);
                fetchUsers();
            } else {
                setError(data.message || 'Failed to delete user.');
            }
        } catch (err) {
            setError('Failed to delete user.');
        }
    };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    const totalPages = Math.ceil(users.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, users.length);
    const currentData = users.slice(startIndex, endIndex);

    return (
        <div className="p-8 space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white mb-1">
                        User Management
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 font-medium">
                        Configure user accounts and administrative privileges.
                    </p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 px-6 h-12 bg-primary text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-primary/20"
                >
                    <span className="material-symbols-outlined text-lg">person_add</span>
                    Add New User
                </button>
            </div>

            {/* Success Popup Modal */}
            {success && createPortal(
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
                    <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-white/20 p-8 text-center">
                        <div className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-6 mx-auto">
                            <span className="material-symbols-outlined text-emerald-500 text-4xl">check_circle</span>
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2 tracking-tight uppercase">Success!</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-8 leading-relaxed px-4">
                            {success}
                        </p>
                        <button
                            onClick={() => setSuccess(null)}
                            className="w-full h-14 bg-emerald-500 text-white text-[12px] font-black rounded-2xl hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 uppercase tracking-widest transition-all"
                        >
                            Got it
                        </button>
                    </div>
                </div>,
                document.body
            )}
            {error && (
                <div className="bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 p-4 rounded-2xl border border-rose-100 dark:border-rose-800 flex items-center gap-3">
                    <span className="material-symbols-outlined">error</span>
                    <span className="font-bold text-sm tracking-tight">{error}</span>
                </div>
            )}

            {/* Users Table & Pagination Container */}
            <div className="bg-white dark:bg-[#101822] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
                <div className="overflow-x-auto scrollbar-premium">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">S.No</th>
                                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Full Name</th>
                                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Emp Code</th>
                                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Role</th>
                                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Permissions</th>
                                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                            {currentData.map((u, index) => (
                                <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 group">
                                    <td className="px-8 py-2 text-sm font-bold text-slate-400 tracking-tight">{startIndex + index + 1}</td>
                                    <td className="px-6 py-2">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center text-blue-500">
                                                <span className="material-symbols-outlined text-xl">person</span>
                                            </div>
                                            <span className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
                                                {u.name || 'Unnamed User'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-2 text-center">
                                        <div className="flex justify-center items-center h-full font-mono text-sm font-bold uppercase text-slate-400">
                                            {u.employee_code}
                                        </div>
                                    </td>
                                    <td className="px-6 py-2 text-center">
                                        <div className="flex justify-center items-center h-full">
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${u.role === 'admin'
                                                    ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                                                }`}>
                                                {u.role}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-2 text-center">
                                        <div className="flex justify-center items-center h-full">
                                            {u.role === 'user' ? (
                                                <div className="flex flex-wrap items-center justify-center gap-1.5">
                                                    {u.permissions?.length > 0 ? (
                                                        u.permissions.map((p, i) => (
                                                            <span key={i} className="px-2 py-0.5 rounded-2xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] font-bold border border-blue-100 dark:border-blue-800/50">
                                                                {p}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="text-slate-400 text-[10px] font-bold tracking-widest uppercase">NO PERM</span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-slate-300 dark:text-slate-700 font-bold">—</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-2 text-center">
                                        <div className="flex justify-center items-center h-full">
                                            {u.is_initial_password ? (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-500 text-[10px] font-black uppercase tracking-widest border border-blue-100 dark:border-blue-800">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                                    Setup Required
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 text-[10px] font-black uppercase tracking-widest border border-emerald-100 dark:border-emerald-800">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                    Active
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-8 py-2 text-right flex items-center justify-end gap-1">
                                        <button
                                            onClick={() => handleEditClick(u)}
                                            className="w-10 h-10 text-slate-300 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-2xl transition-all"
                                            title="Edit User"
                                        >
                                            <span className="material-symbols-outlined text-xl">edit</span>
                                        </button>
                                        <button
                                            onClick={() => setShowDeleteModal(u)}
                                            disabled={u.employee_code === 'admin'}
                                            className={`w-10 h-10 transition-all rounded-2xl flex items-center justify-center ${u.employee_code === 'admin'
                                                    ? 'text-slate-200 dark:text-slate-800 cursor-not-allowed'
                                                    : 'text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20'
                                                }`}
                                            title={u.employee_code === 'admin' ? "System Admin cannot be deleted" : "Delete User"}
                                        >
                                            <span className="material-symbols-outlined text-xl">delete</span>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Footer */}
                {users.length > 0 && (
                    <div className="flex items-center justify-between px-8 py-4 bg-slate-50/30 dark:bg-slate-800/10 border-t border-slate-100 dark:border-slate-800/50">
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Showing <span className="font-semibold text-slate-700 dark:text-slate-200">{startIndex + 1}</span> to <span className="font-semibold text-slate-700 dark:text-slate-200">{endIndex}</span> of <span className="font-semibold text-slate-700 dark:text-slate-200">{users.length}</span> results
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="h-9 w-9 flex items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-white dark:hover:bg-slate-800 dark:hover:text-slate-200 disabled:opacity-50 disabled:hover:bg-transparent transition-all active:scale-90"
                            >
                                <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                            </button>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="h-9 w-9 flex items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-white dark:hover:bg-slate-800 dark:hover:text-slate-200 disabled:opacity-50 disabled:hover:bg-transparent transition-all active:scale-90"
                            >
                                <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Add User Modal */}
            {showAddModal && createPortal(
                <div className="fixed top-0 left-0 w-full h-full z-[999] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
                    <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-white/20 max-h-[90vh] flex flex-col overflow-hidden">
                        <div className="p-6 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800 relative">
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                                {isEditing ? 'Edit User' : 'Add New User'}
                            </h3>
                            <button
                                onClick={handleCloseModal}
                                className="absolute w-10 h-10 top-5 right-5 flex items-center justify-center text-slate-400 hover:text-rose-500 bg-slate-100 dark:bg-slate-700/40 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-full transition-all"
                                title="Close"
                            >
                                <span className="material-symbols-outlined text-xl">close</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                            <form onSubmit={isEditing ? handleUpdateUser : handleAddUser} className="space-y-6">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                                            Employee Code <span className="text-rose-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            disabled={isEditing}
                                            className={`w-full h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none dark:text-white ${isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            placeholder="JC0001"
                                            value={formData.employee_code}
                                            onChange={(e) => setFormData({ ...formData, employee_code: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                                            Full Name <span className="text-rose-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none dark:text-white"
                                            placeholder="Display Name"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Mail ID</label>
                                        <input
                                            type="email"
                                            className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none dark:text-white"
                                            placeholder="user@example.com"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Password <span className="text-rose-500">*</span></label>
                                        <input
                                            type="text"
                                            className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none dark:text-white"
                                            placeholder="********"
                                            value={formData.password}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Role <span className="text-rose-500">*</span></label>
                                    <div className="grid grid-cols-6 gap-4">
                                        <button
                                            type="button"
                                            onClick={() => setFormData({
                                                ...formData,
                                                role: 'user',
                                                permissions: []
                                            })}
                                            className={`h-12 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all ${formData.role === 'user'
                                                    ? 'bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-500/20'
                                                    : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 text-slate-400'
                                                }`}
                                        >
                                            User
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData({
                                                ...formData,
                                                role: 'admin',
                                                permissions: ['AS', 'ASE', 'ASQ', 'GC', 'GCE', 'JC', 'RP', 'SCE', 'SCS', 'SN']
                                            })}
                                            className={`h-12 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${formData.role === 'admin'
                                                    ? 'bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-500/20'
                                                    : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 text-slate-400'
                                                }`}
                                        >
                                            Admin
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Permissions <span className="text-rose-500">*</span></label>
                                    <div className="grid grid-cols-5 gap-2 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                                        {['AS', 'ASE', 'ASQ', 'GC', 'GCE', 'JC', 'RP', 'SCE', 'SCS', 'SN'].map(perm => (
                                            <button
                                                key={perm}
                                                type="button"
                                                onClick={() => togglePermission(perm)}
                                                className={`h-10 rounded-2xl text-[10px] font-black transition-all border ${formData.permissions.includes(perm)
                                                        ? 'bg-amber-500 border-amber-500 text-white shadow-md'
                                                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-400'
                                                    }`}
                                            >
                                                {perm}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 pt-4">
                                    <button
                                        type="button"
                                        onClick={handleCloseModal}
                                        className="h-12 bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-black rounded-2xl hover:bg-slate-200 uppercase tracking-widest"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="h-12 bg-primary text-white text-[10px] font-black rounded-2xl shadow-lg shadow-primary/20 uppercase tracking-widest"
                                    >
                                        {isEditing ? 'Update User' : 'Create User'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Delete Confirmation */}
            {showDeleteModal && createPortal(
                <div className="fixed top-0 left-0 w-full h-full z-[999] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
                    <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-white/20">
                        <div className="p-10 text-center">
                            <div className="w-20 h-20 rounded-full bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center mb-6 mx-auto">
                                <span className="material-symbols-outlined text-rose-500 text-3xl">person_remove</span>
                            </div>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">Remove Member?</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-10 px-4">
                                Account for <span className="font-bold text-slate-900 dark:text-white">@{showDeleteModal.employee_code}</span> will be permanently deactivated.
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => setShowDeleteModal(null)}
                                    className="h-14 bg-slate-100 dark:bg-slate-800 text-slate-500 text-[12px] font-black rounded-2xl hover:bg-slate-200 uppercase tracking-widest"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDeleteUser}
                                    className="h-14 bg-rose-500 text-white text-[12px] font-black rounded-2xl hover:bg-rose-600 shadow-lg shadow-rose-500/20 uppercase tracking-widest"
                                >
                                    Confirm
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default UsersManager;
