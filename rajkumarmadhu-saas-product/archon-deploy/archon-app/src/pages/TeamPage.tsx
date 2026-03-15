import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    UserPlus, Shield, Crown, Eye, User, Trash2, ChevronDown
} from 'lucide-react'
import { getTeamMembers, inviteTeamMember, updateMemberRole, removeMember } from '../lib/api'

interface Member {
    id: string
    githubLogin: string
    email: string | null
    role: string
    createdAt: string
}

const roleIcons: Record<string, any> = {
    owner: <Crown size={14} className="icon-orange" />,
    admin: <Shield size={14} className="icon-purple" />,
    member: <User size={14} className="icon-blue" />,
    viewer: <Eye size={14} className="icon-dim" />,
}

export default function TeamPage({ addToast }: { addToast: (t: any) => void }) {
    const [members, setMembers] = useState<Member[]>([])
    const [loading, setLoading] = useState(true)
    const [showInvite, setShowInvite] = useState(false)
    const [inviteLogin, setInviteLogin] = useState('')
    const [inviteEmail, setInviteEmail] = useState('')
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

    const handleInvite = async () => {
        if (!inviteLogin.trim()) return
        setInviting(true)
        try {
            const result = await inviteTeamMember(inviteLogin.trim(), inviteEmail.trim() || undefined)
            if (result.invited) {
                addToast({ type: 'success', title: 'Member invited', message: `${inviteLogin} has been added to the team` })
            } else {
                addToast({ type: 'info', title: 'Already a member', message: `${inviteLogin} is already in the team` })
            }
            setInviteLogin('')
            setInviteEmail('')
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
                    <span>Invite Member</span>
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
                        <h3>Invite a new member</h3>
                        <div className="invite-fields">
                            <div className="field">
                                <label>GitHub Username</label>
                                <input
                                    type="text"
                                    value={inviteLogin}
                                    onChange={(e) => setInviteLogin(e.target.value)}
                                    placeholder="e.g. octocat"
                                    onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                                />
                            </div>
                            <div className="field">
                                <label>Email (optional)</label>
                                <input
                                    type="email"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    placeholder="user@example.com"
                                />
                            </div>
                            <button className="glow-btn" onClick={handleInvite} disabled={inviting || !inviteLogin.trim()}>
                                {inviting ? 'Inviting...' : 'Send Invite'}
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
                                                {roleIcons[role]} {role}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <button
                                        className="role-badge-btn"
                                        onClick={() => setEditingRole(member.id)}
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
