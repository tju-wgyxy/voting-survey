// 阿里云函数计算（FC）Web 函数入口
// 部署时需设置：环境变量 DATA_DIR 为 /tmp
// 函数入口：fc.handler

import app from "./app.js";

export const handler = (req, resp, context) => {
  app(req, resp);
};
