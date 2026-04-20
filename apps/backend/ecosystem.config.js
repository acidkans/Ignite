module.exports = {
    apps: [{
        name: 'erp-backend',
        script: 'npm',
        args: 'run start:dev',
        // Na Windowsie PM2 czasem potrzebuje pełnej nazwy dla npm
        interpreter: 'none',
        env: {
            NODE_ENV: 'development',
            // Wymuszamy klucz tutaj na wypadek problemów z .env
            JWT_SECRET: 'super_tajny_klucz_jwt_zmien_go_na_produkcji_123456'
        }
    }]
};
