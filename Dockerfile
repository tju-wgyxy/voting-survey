FROM node:20-alpine

WORKDIR /app

# 先安装依赖（利用Docker缓存）
COPY package*.json ./
RUN npm install --production

# 复制项目文件
COPY . .

# 创建数据目录
RUN mkdir -p data

# CloudBase 云托管默认使用 80 端口
ENV PORT=80
EXPOSE 80

# 启动应用
CMD ["node", "server.js"]
