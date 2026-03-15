import { useEffect, useState } from 'react';
import { ArrowLeft, Github, GitBranch } from 'lucide-react';
import './SignInPage.css';

interface SignInPageProps {
    onBack: () => void;
    onGithubLogin: () => void;
}

export default function SignInPage({ onBack, onGithubLogin }: SignInPageProps) {
    // Track mouse movements to slightly tilt the entire 3D layout for realism
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            const { innerWidth, innerHeight } = window;
            // Gentle, professional rotation limit (e.g. -6 to +6 degrees)
            const x = (e.clientX / innerWidth - 0.5) * 12;
            const y = (e.clientY / innerHeight - 0.5) * -12;
            setMousePos({ x, y });
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    return (
        <div className="sign-in-page">
            <button className="back-btn" onClick={onBack}>
                <ArrowLeft size={16} /> Back
            </button>

            {/* Elegant Subdued Background Meshes */}
            <div className="floating-shape shape-1" />
            <div className="floating-shape shape-2" />
            <div className="floating-shape shape-3" />

            {/* 4D Subtle Grid Horizons */}
            <div className="grid-floor" />
            <div className="grid-ceiling" />

            {/* Main 3D Container responsive to mouse movement */}
            <div
                className="sign-in-card-container"
                style={{ transform: `rotateY(${mousePos.x}deg) rotateX(${mousePos.y}deg)` }}
            >
                <div className="sign-in-card">

                    {/* Professional 3D Robot Mascot */}
                    <div className="git-toy-wrapper">
                        <div className="git-toy-body">
                            <div className="git-toy-face">
                                <div className="git-eye"></div>
                                <GitBranch size={22} color="#475569" strokeWidth={2.5} />
                                <div className="git-eye"></div>
                            </div>
                        </div>
                        <div className="git-shadow"></div>
                    </div>

                    <h2 className="sign-in-title">Welcome to Archon</h2>
                    <p className="sign-in-desc">
                        The intelligent AI copilot for GitHub. Elevate your code review and automation workflow.
                    </p>

                    <button className="gh-sign-in-btn" onClick={onGithubLogin}>
                        <Github size={20} />
                        <span>Continue with GitHub</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
