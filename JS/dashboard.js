document.addEventListener('DOMContentLoaded', () => {
    // 1. Navigation & UI Interactions
    const navbar = document.getElementById('navbar');
    const menuToggle = document.getElementById('menuToggle');
    const navMenu = document.getElementById('navMenu');

    // Add shadow on scroll
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Mobile menu toggle
    if (menuToggle && navMenu) {
        menuToggle.addEventListener('click', () => {
            const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
            menuToggle.setAttribute('aria-expanded', !isExpanded);
            navMenu.classList.toggle('active');
        });
    }

    // 2. Modal Management
    const openModal = (modalId) => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.removeAttribute('hidden');
            document.body.style.overflow = 'hidden'; // Prevent background scrolling
        }
    };

    const closeModal = (modalId) => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.setAttribute('hidden', 'true');
            document.body.style.overflow = '';
        }
    };

    // Bind close buttons
    document.querySelectorAll('.modal-close').forEach(button => {
        button.addEventListener('click', (e) => {
            const modalId = e.currentTarget.getAttribute('data-close-modal');
            closeModal(modalId);
        });
    });

    // Global button triggers
    document.getElementById('loginNavBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        openModal('loginModal');
    });

    document.querySelectorAll('#startNavBtn, #heroStartBtn, #ctaStartBtn, #dashStartNewBtn').forEach(btn => {
        btn?.addEventListener('click', () => openModal('setupModal'));
    });

    // Category card triggers
    document.querySelectorAll('.category-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const role = e.currentTarget.getAttribute('data-role');
            const setupRoleSelect = document.getElementById('setupRole');

            if (setupRoleSelect && role) {
                setupRoleSelect.value = role;
            }
            openModal('setupModal');
        });
    });

    // 3. Mock Dashboard Data Initialization
    // This simulates fetching performance telemetry from your MySQL database
    const loadDashboardData = () => {
        const mockData = {
            avgScore: 8.4,
            totalInterviews: 15,
            latestRole: "Database Systems Engineer",
            latestScore: 8.9,
            recentHistory: [
                { role: "Database Systems Engineer", date: "Oct 10, 2026", qs: 10, score: 8.9, status: "good" },
                { role: "C++ Software Developer", date: "Oct 05, 2026", qs: 5, score: 8.2, status: "good" },
                { role: "IoT Architecture", date: "Sep 28, 2026", qs: 5, score: 7.6, status: "average" },
                { role: "Full Stack Developer", date: "Sep 20, 2026", qs: 10, score: 8.6, status: "good" }
            ]
        };

        // Update summary metrics
        const dashAvgScore = document.getElementById('dashAvgScore');
        const dashTotalInterviews = document.getElementById('dashTotalInterviews');
        const dashLatestRole = document.getElementById('dashLatestRole');
        const dashLatestScore = document.getElementById('dashLatestScore');

        if (dashAvgScore) dashAvgScore.textContent = mockData.avgScore;
        if (dashTotalInterviews) dashTotalInterviews.textContent = mockData.totalInterviews;
        if (dashLatestRole) dashLatestRole.textContent = mockData.latestRole;
        if (dashLatestScore) dashLatestScore.textContent = `${mockData.latestScore} / 10`;

        // Populate recent interviews list
        const recentList = document.getElementById('dashRecentList');
        if (recentList) {
            recentList.innerHTML = '';
            mockData.recentHistory.forEach(interview => {
                const row = document.createElement('div');
                row.className = 'recent-row';
                row.innerHTML = `
          <div class="recent-info">
            <span class="recent-role">${interview.role}</span>
            <span class="recent-date">${interview.date} • ${interview.qs} Questions</span>
          </div>
          <div class="recent-score-badge ${interview.status}">${interview.score}</div>
        `;
                recentList.appendChild(row);
            });
        }
    };

    // Initialize data
    loadDashboardData();
});