FROM node:25-slim
WORKDIR /app
# 100-line HTTP server — no dependencies, just node stdlib.
COPY src ./src
ENV PORT=8080 HOST=0.0.0.0 WALRUS_DATA_DIR=/data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
