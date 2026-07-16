# Content Log 检查清单

> 游戏内验证时需开启 Content Log，逐项确认无 warning/error。

## 包加载阶段

- [ ] 无 manifest UUID 重复错误
- [ ] 无 manifest dependency 解析错误
- [ ] BP 只依赖 RP header UUID，RP 无反向依赖
- [ ] 两包 version 全链路一致 [1,0,5]

## 物品注册阶段

- [ ] 无 item schema 错误（format_version 1.20.20）
- [ ] 无 atlas 图集 key 未定义错误
- [ ] 无 menu_category group 解析错误

## 实体注册阶段

- [ ] 无 entity schema 错误
- [ ] 无 property client_sync 解析错误
- [ ] 无 interact 组件解析错误

## 脚本加载阶段

- [ ] 无脚本导入错误（@minecraft/server 2.6.0）
- [ ] 无模块版本不匹配错误
- [ ] 无 early-execution 世界修改 API 错误
- [ ] 进入世界出现一次 "[自定义NPC] 脚本已加载" 消息

## 交互与 UI 阶段

- [ ] 右键 NPC 无 "User is not authorized" 错误
- [ ] form.show 无 Promise rejection 未捕获
- [ ] beforeEvents.cancel 无权限错误

## 皮肤与渲染阶段

- [ ] 无 geometry 解析错误
- [ ] 无 render_controller 数组越界错误
- [ ] 无 texture 引用缺失错误
- [ ] 无 material entity_alphatest 解析错误

## 持久化阶段

- [ ] 无 Dynamic Property 读取错误
- [ ] 无 JSON.parse 异常（损坏数据应安全回退）
- [ ] 世界重进后数据不丢失

## AI 阶段

- [ ] 无 teleport 权限错误
- [ ] 无 getEntities 性能警告
- [ ] AI 状态不修改 nameTag
