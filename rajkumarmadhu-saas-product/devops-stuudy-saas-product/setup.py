from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

with open("requirements.txt", "r", encoding="utf-8") as fh:
    requirements = fh.read().splitlines()

setup(
    name="santhira-troubleshooter",
    version="0.1.0",
    author="Rajkumar Madhu",
    author_email="raj@raj.net",
    description="AI-powered DevOps troubleshooting platform",
    long_description="Enterprise SaaS DevOps platform with AI-powered troubleshooting, learning, deployment, and interview preparation",
    long_description_content_type="text/markdown",
    url="https://github.com/rajmadhu0608/santhira",
    packages=find_packages(where="backend"),
    package_dir={"": "backend"},
    install_requires=requirements,
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.8",
    entry_points={
        "console_scripts": [
            "santhira-troubleshooter=santhira.cli:main",
        ],
    },
)