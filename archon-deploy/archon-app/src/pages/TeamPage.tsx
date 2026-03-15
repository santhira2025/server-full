import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    UserPlus, Shield, Crown, Eye, User, Trash2, ChevronDown, Plus, X
} from 'lucide-react'
import { getTeamMembers, inviteTeamMember, updateMemberRole, removeMember } from '../lib/api'

interface Member {
    id: string
    githubLogin: string
    email: string | null
    role: string
    createdAt: string
}

interface InviteEntry {
    login: string
    email: string
    role: string
}

const ROLES = ['member', 'admin', 'viewer'] as const

const roleIcons: Record<string, any> = {
    owner: <Crown size={14} className="icon-orange" />,
    admin: <Shield size={14} className="icon-purple" />,
    member: <User size={14} className="icon-blue" />,
    viewer: <Eye size={14} className="icon-dim" />,
}

const roleDescriptions: Record<string, string> = {
    owner: 'Full access + billing',
    admin: 'Manage repos + team',
    member: 'View + trigger reviews',
    viewer: 'Read-only access',
}

function emptyEntry(): InviteEntry {
    return { login: '', email: '', role: 'member' }
}

export default function TeamPage({ addToast }: { addToast: (t: any) => void }) {
    const [members, setMembers] = useState<Member[]>([])
    const [loading, setLoading] = useState(true)
    const [showInvite, setShowInvite] = useState(false)
    const [entries, setEntries] = useState<InviteEntry[]>([emptyEntry()])
    const [inviting, setInviting] = useState(false)
    const [editingRole, setEditingRole] = useState<string | null>(null)

    const fetchMembers = async () => {
        try {
            const data = await getTeamMembers()
            setMembers(data || [])
        } catch {
            addToast({ type: 'error', title: 'Failed to load team members' })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchMembers() }, [])

    const updateEntry = (i: number, field: keyof InviteEntry, value: string) => {
        setEntries(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e))
    }

    const addEntry = () => setEntries(prev => [...prev, emptyEntry()])

    const removeEntry = (i: number) => {
        if (entries.length === 1) return
        setEntries(prev => prev.filter((_, idx) => idx !== i))
    }

    const handleInvite = async () => {
        const valid = entries.filter(e => e.login.trim())
        if (valid.length === 0) return
        setInviting(true)
        let invitedCount = 0
        let existingCount = 0
        try {
            for (const entry of valid) {
                const result = await inviteTeamMember(entry.login.trim(), entry.email.trim() || undefined)
                if (result.invited) invitedCount++
                else existingCount++
            }
            if (invitedCount > 0) {
                addToast({ type: 'success', title: `${invitedCount} member${invitedCount > 1 ? 's' : ''} invited` })
            }
            if (existingCount > 0) {
                addToast({ type: 'info', title: `${existingCount} already in team` })
            }
            setEntries([emptyEntry()])
            setShowInvite(false)
            fetchMembers()
        } catch {
            addToast({ type: 'error', title: 'Invite failed' })
        } finally {
            setInviting(false)
        }
    }

    const handleRoleChange = async (memberId: string, newRole: string) => {
        try {
            await updateMemberRole(memberId, newRole)
            addToast({ type: 'success', title: 'Role updated' })
            setEditingRole(null)
            fetchMembers()
        } catch {
            addToast({ type: 'error', title: 'Failed to update role' })
        }
    }

    const handleRemove = async (member: Member) => {
        if (!confirm(`Remove ${member.githubLogin} from the team?`)) return
        try {
            await removeMember(member.id)
            addToast({ type: 'success', title: 'Member removed', message: `${member.githubLogin} has been removed` })
            fetchMembers()
        } catch {
            addToast({ type: 'error', title: 'Failed to remove member' })
        }
    }

    const validEntries = entries.filter(e => e.login.trim()).length

    if (loading) {
        return (
            <div className="team-page">
                <div className="section-header"><h2>Team</h2></div>
                <div className="loading-state">Loading team...</div>
            </div>
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="team-page"
        >
            <div className="section-header-row">
                <div>
                    <h2>Team Management</h2>
                    <p>Manage your organization's team members and roles</p>
                </div>
                <button className="glow-btn" onClick={() => setShowInvite(!showInvite)}>
                    <UserPlus size={16} />
                    <span>Invite Members</span>
                </button>
            </div>

            {/* Invite Form */}
            <AnimatePresence>
                {showInvite && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="glass-card invite-form"
                    >
                        <h3>Invite team members</h3>
                        <p className="invite-hint">Add multiple members at once. Each gets the selected role.</p>

                        <div className="bulk-invite-list">
                            {entries.map((entry, i) => (
                                <div key={i} className="bulk-invite-row">
                                    <div className="bulk-invite-fields">
                                        <input
                                            type="text"
                                            value={entry.login}
                                            onChange={(e) => updateEntry(i, 'login', e.target.value)}
                                            placeholder="GitHub username"
                                            onKeyDown={(e) => e.key === 'Enter' && i === entries.length - 1 && addEntry()}
                                        />
                                        <input
                                            type="email"
                                            value={entry.email}
                                            onChange={(e) => updateEntry(i, 'email', e.target.value)}
                                            placeholder="Email (optional)"
                                        />
                                        <select
                                            value={entry.role}
                                            onChange={(e) => updateEntry(i, 'role', e.target.value)}
                                            className="role-select"
                                        >
                                            {ROLES.map(r => (
                                                <option key={r} value={r}>{r} — {roleDescriptions[r]}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {entries.length > 1 && (
                                        <button className="remove-entry-btn" onClick={() => removeEntry(i)}>
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="invite-footer">
                            <button className="add-more-btn" onClick={addEntry}>
                                <Plus size={14} />
                                <span>Add another</span>
                            </button>
                            <button
                                className="glow-btn"
                                onClick={handleInvite}
                                disabled={inviting || validEntries === 0}
                            >
                                {inviting ? 'Inviting...' : `Invite ${validEntries > 0 ? validEntries : ''} member${validEntries !== 1 ? 's' : ''}`}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Members List */}
            <div className="glass-card members-card">
                <div className="card-header">
                    <h3>Members ({members.length})</h3>
                </div>
                <div className="members-list">
                    {members.map((member, i) => (
                        <motion.div
                            key={member.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="member-item"
                        >
                            <img
                                src={`https://github.com/${member.githubLogin}.png`}
                                alt={member.githubLogin}
                                className="member-avatar"
                            />
                            <div className="member-info">
                                <span className="member-name">{member.githubLogin}</span>
                                {member.email && <span className="member-email">{member.email}</span>}
                            </div>

                            <div className="member-role-section">
                                {editingRole === member.id ? (
                                    <div className="role-dropdown">
                                        {['owner', 'admin', 'member', 'viewer'].map(role => (
                                            <button
                                                key={role}
                                                className={`role-option ${member.role === role ? 'current' : ''}`}
                                                onClick={() => handleRoleChange(member.id, role)}
                                            >
                                                {roleIcons[role]}
                                                <span>{role}</span>
                                                <span className="role-desc">{roleDescriptions[role]}</span>
                                            </button>
                                        ))}
                                        <button className="role-cancel" onClick={() => setEditingRole(null)}>Cancel</button>
                                    </div>
                                ) : (
                                    <button
                                        className="role-badge-btn"
                                        onClick={() => setEditingRole(member.id)}
                                        title={roleDescriptions[member.role]}
                                    >
                                        {roleIcons[member.role]}
                                        <span>{member.role}</span>
                                        <ChevronDown size={12} />
                                    </button>
                                )}
                            </div>

                            {member.role !== 'owner' && (
                                <button className="remove-btn" onClick={() => handleRemove(member)}>
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </motion.div>
                    ))}
                </div>
            </div>
        </motion.div>
    )
}
