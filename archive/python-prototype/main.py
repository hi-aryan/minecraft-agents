from javascript import require, On, Once, AsyncTask, once, off
from simple_chalk import chalk

mineflayer = require('mineflayer')

# globals
server_host = 'localhost'
server_port = 3000
server_version = '1.19.4'
server_hideErrors = False
reconnect = True

class MCBot:

    def __init__(self, bot_name):
        self.bot_args = {
            'host': server_host,
            'port': server_port,
            'username': bot_name,
            'version': server_version,
            'hideErrors': server_hideErrors,
        }
        self.reconnect = reconnect
        self.name = bot_name
        self.bot = None
        self.start_bot()


    def log(self, message):
        print(f'[{self.bot.username}] {message}')


    def start_bot(self):
        self.bot = mineflayer.createBot(self.bot_args)
        self.start_events()


    def start_events(self):

        @On(self.bot, 'login')
        def login(this):
            self.bot_socket = self.bot._client.socket
            self.log(chalk.green(f'Logged to {self.bot_socket.server if self.bot_socket.server else self.bot_socket._host}'))


        @On(self.bot, 'spawn')
        def spawn(this):
            self.bot.chat(f'Hello! I am {this.username}')


        @On(self.bot, 'kicked')
        def kicked(this, reason, loggedIn):
            if loggedIn:
                self.log(chalk.yellow(f'Kicked: {reason}'))
            else:
                self.log(chalk.magenta(f'Kicked before login: {reason}'))


        @On(self.bot, 'messagestr')
        def messagestr(this, message, messagePosition, jsonMsg, sender, verified=None):
            if messagePosition == 'chat':
                if 'quit' in message:
                    self.reconnect = False
                    self.bot.chat('bye')
                    self.bot.quit() # same as this.quit()
                elif 'hi' in message: 
                    self.bot.chat('fuck u!')


        @On(self.bot, 'end')
        def end(this, reason):
            self.log(chalk.red(f'Disconnected: {reason}'))

            off(self.bot, 'login', login)
            off(self.bot, 'spawn', spawn)
            off(self.bot, 'kicked', kicked)
            off(self.bot, 'messagestr', messagestr)

            if self.reconnect:
                self.log(chalk.cyan('Attempting to reconnect'))
                self.start_bot()

            off(self.bot, 'end', end)


bot1 = MCBot("benny")
bot2 = MCBot("kenny")