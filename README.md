# any-balance-devtools
Development support tools for [AnyBalance](https://anybalance.ru), [AnyBalanceDebugger](https://github.com/dukei/AnyBalanceDebugger), [any-balance-providers](https://github.com/dukei/any-balance-providers)

Программа предназначена для облегчения разработки [провайдеров AnyBalance](https://github.com/dukei/any-balance-providers).

# Установка
Программа потенциально может быть запущена в Windows, Linux, MacOS. В настоящее время релизы делаются только для Win64. Если программа нужна для других оп. систем, 
запросите в [Issues](https://github.com/dukei/any-balance-devtools/issues) или соберите самостоятельно из исходного кода. 

## Win64
1. Загрузите последний [релиз](https://github.com/dukei/any-balance-devtools/issues)
1. Распакуйте в какой-нибудь каталог, например, `C:\abd`
1. Добавьте этот каталог в переменную окружения PATH
1. Проверьте, что всё ок
```bash
>abd --version
AnyBalanceDevtools v1.2.2 
```

## Сборка из исходного кода
1. Требуется nodejs 12+
1. `git clone https://github.com/dukei/any-balance-devtools.git`
1. `cd any-balance-devtools`
1. `yarn`
1. `yarn build`

# Использование

Подробнее в [описании](https://github.com/dukei/any-balance-devtools/wiki/Usage). Ниже приведен список наиболее полезных команд.

`abd serve` - запуск сервера для поддержки [AnyBalanceDebugger](https://github.com/dukei/AnyBalanceDebugger),
чтобы отладчик мог подтягивать зависимости провайдера автоматически, а также для поддержки показа капчи

`abd bootstrap` - создать в текущем каталоге новый провайдер или добавить отладочные файлы к существующему провайдеру

`abd pack` - запаковать провайдер из текущего каталога со всеми зависимостями в zip файл для отправки на устройство в программу AnyBalance

`abd increment` - увеличение версии провайдера из текущего каталога, валидация и компиляция модулей, предложение сделать commit изменений 

`abd update` - обновить программу на последнюю версию

