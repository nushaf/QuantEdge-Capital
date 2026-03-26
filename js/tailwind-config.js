tailwind.config = {
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                dark: '#050505',
                darker: '#000000',
                darkCard: '#0f0f13',
                neonBlue: '#00f3ff',
                neonGreen: '#00ff66',
                neonGold: '#ffd700',
                neonRed: '#ff3366',
                gray: {
                    800: '#1f1f23',
                    900: '#131316',
                }
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                display: ['Outfit', 'sans-serif'],
            },
            backgroundImage: {
                'gradient-primary': 'linear-gradient(135deg, #00f3ff 0%, #0055ff 100%)',
                'gradient-success': 'linear-gradient(135deg, #00ff66 0%, #009933 100%)',
            }
        }
    }
}
