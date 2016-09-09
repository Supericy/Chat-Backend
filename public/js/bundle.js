(function () {

    // Enable pusher logging - don't include this in production
    Pusher.logToConsole = true;

    var publicifyUser = function (user) {
        return {
            id: user.id,
            name: user.name
        };
    };

    var resizeAndScrollMessages = function () {
        var $messages = $('.messages');

        $messages
            .getNiceScroll(0)
            .resize();
        $messages.getNiceScroll(0)
            .doScrollTop(999999, 999);
    };

    var User = function (parameters) {
        this.id = parameters.id;
        this.name = parameters.name;
        this.created_at = parameters.created_at;
        this.api_token = parameters.api_token;
    };

    var Message = function (parameters, confirmed) {
        this.id = parameters.id;
        this.user_id = parameters.user_id;
        this.text = parameters.text;
        this.created_at = parameters.created_at;
        this.confirmed = confirmed || false;
    };

    var App = function () {
        var self = this;

        this.init = function (currentUser) {
            self.user = currentUser;
            self.pusher = new Pusher('944b0bdac25cd6df507f', {
                authEndpoint: '/api/v1/pusher/auth',
                auth: {
                    headers: {
                        'Authorization': 'API-TOKEN ' + currentUser.api_token
                    }
                },
                encrypted: true
            });

            var pChannel = self.pusher.subscribe('presence-general');

            //ko.applyBindings(function () {}, $('#ko-container')[0]);
            ko.applyBindings(new ChannelListViewModel(pChannel), $('#channels')[0]);
            ko.applyBindings(new ChatViewModel(pChannel, currentUser), $('#chat')[0]);
            ko.applyBindings(new UserListViewModel(pChannel), $('#users')[0]);
        };

        this.initAuth = function () {
            var authModal = new AuthModal();
            authModal.show();

            ko.applyBindings(new LoginViewModel(function (user) {
                authModal.hide();
                self.init(user);

            }), $('#login')[0]);
        };
    };

    var AuthModal = function () {
        var $login = $('#login');
        var $modal = $('#login-modal');

        this.show = function () {
            $modal.modal({
                backdrop: 'static',
                keyboard: false
            });
        };

        this.hide = function () {
            $modal.modal('hide');
            $modal.on('hidden.bs.modal', function () {
                $login.remove();
            });
        };
    };

    var UserListViewModel = function (pChannel) {
        var self = this;

        this.searchQuery = ko.observable("");
        this.users = ko.observableArray();

        this.filteredUsers = ko.computed(function () {
            return ko.utils.arrayFilter(self.users(), function (user) {
                return user.name.toLowerCase().indexOf(self.searchQuery()) > -1;
            });
        });

        this.addUser = function (user) {
            console.log('User Added', user);
            if (self.users().indexOf(user) < 0) {
                self.users.push(user);
            }
        };

        this.removeUser = function (user) {
            console.log('User Removed', user);
            self.users.remove(user);
        };

        pChannel.bind('pusher:subscription_succeeded', function (status) {
            channel.members.each(function (data) {
                self.addUser(data.info);
            });
        });
        pChannel.bind('pusher:member_added', function (data) {
            self.addUser(data.info);
        });
        pChannel.bind('pusher:member_removed', function (data) {
            self.removeUser(data.info);
        });
    };

    var ChannelListViewModel = function (pChannel) {
        var self = this;

        this.channels = ko.observableArray([
            {name: 'General'},
            {name: 'Test Channel'}
        ]);
    };

    var ChatViewModel = function (pChannel, currentUser) {
        var self = this;

        this.user = ko.observable(currentUser);
        this.newMessage = ko.observable("");
        this.messages = ko.observableArray([
            new MessageViewModel(currentUser, currentUser, new Message({
                id: -1,
                user_id: currentUser.id,
                text: 'Test Message (ignore)',
                created_at: Date.now()
            }), true)
        ]);
        this.typing = ko.observableArray();

        this.confirmMessage = function (confirmedMessage) {
            var returnMessageVM;

            this.messages().some(function (messageVM) {
                returnMessageVM = messageVM;

                return messageVM.confirmMessage(confirmedMessage);
            });

            return returnMessageVM;
        };

        this.receive = function (user, message) {
            // FIXME: compare id instead?
            if (currentUser.name === user.name) {
                return this.confirmMessage(message);
            } else {
                return this.pushMessage(user, message, true);
            }
        };

        this.pushMessage = function (user, message, confirmed) {
            var messageVM = self.messages()[self.messages().length - 1];

            if (messageVM.name() === user.name) {
                messageVM.attachMessage(message, confirmed);
            } else {
                messageVM = new MessageViewModel(currentUser, user, message, confirmed);
                this.messages.push(messageVM);
            }

            resizeAndScrollMessages();

            return messageVM;
        };

        this.send = function () {
            if (self.newMessage().length < 1) {
                return;
            }

            $.ajax({
                    type: "POST",
                    url: '/api/v1/chat/send',
                    headers: {
                        'Authorization': 'API-TOKEN ' + currentUser.api_token
                    },
                    data: {
                        text: self.newMessage()
                    },
                    dataType: 'json'
                })
                .done(function(data) {
                    //console.log('Send Response', data);
                })
                .fail(function(data) {
                    console.log('Send Failed', data);
                    var error = data.responseJSON.error;

                    console.log('error', error);
                    //self.error(error.message);
                    alert(error.message);

                    // TODO: remove message that was appended locally
                })
                .always(function () {

                });

            //self.pushMessage(currentUser.name, self.newMessage(), Date.now(), false);
            self.pushMessage(currentUser, new Message({
                id: -1,
                user_id: currentUser.id,
                text: self.newMessage(),
                created_at: Date.now()
            }), false);
            self.newMessage("");
        };

        $.ajax({
                type: "GET",
                url: '/api/v1/channel/1/history',
                headers: {
                    'Authorization': 'API-TOKEN ' + currentUser.api_token
                },
                dataType: 'json'
            })
            .done(function(response) {
                console.log('Channel History', response);

                response.data.messages.forEach(function (v) {
                    var user = new User(v.user);
                    var message = new Message(v, true);

                    self.pushMessage(user, message, true);
                });
            })
            .fail(function(data) {
                console.log('Send Failed', data);
                var error = data.responseJSON.error;

                console.log('error', error);
                //self.error(error.message);
                alert(error.message);

                // TODO: remove message that was appended locally
            })
            .always(function () {

            });

        var t;
        this.newMessage.subscribe(function (value) {
            clearTimeout(t);
            t = setTimeout(function () {
                if (value.length > 0) {
                    pChannel.trigger('client-started-typing', publicifyUser(currentUser));
                } else {
                    pChannel.trigger('client-stopped-typing', publicifyUser(currentUser));
                }
            }, 500);
        });

        pChannel.bind('message-new', function (data) {
            console.log('New Message Received', data);
            var user = new User(data.message.user);
            var message = new Message(data.message, true);

            self.receive(user, message);
        });
        pChannel.bind('client-started-typing', function (data) {
            console.log('Started Typing', data);

            var found = false;
            self.typing().forEach(function (item) {
                if (!found)
                    found = item.id === data.id;
            });

            if (!found) {
                self.typing.push(data);
            }
        });
        pChannel.bind('client-stopped-typing', function (data) {
            console.log('Stopped Typing', data);
            self.typing.remove(function (item) {
                return item.id === data.id;
            });
        });
        pChannel.bind('pusher:member_removed', function (data) {
            self.typing.remove(function (item) {
                return item.id === data.info.id;
            });
        });
    };

    var MessageBlock = function (text, confirmed) {
        var self = this;

        this.text = ko.observable(text);
        this.confirmed = ko.observable(confirmed ? "1" : "0");

        this.setMessageConfirmed = function (bool) {
            self.confirmed(bool ? "1" : "0");
        };

        this.isMessageConfirmed = ko.computed(function () {
            return self.confirmed() === "1";
        });
    };

    var MessageViewModel = function (currentUser, user, message, confirmed) {
        var self = this;

        //console.log('New MessageViewModel', user, message);

        this.timestamp = ko.observable(message.created_at);
        this.name = ko.observable(user.name);
        this.messageBlocks = ko.observableArray([
            new MessageBlock(message.text, confirmed)
        ]);

        this.confirmMessage = function (confirmedMessage) {
            this.messageBlocks().some(function (block) {
                if (!block.isMessageConfirmed() && block.text() === confirmedMessage.text) {
                    block.setMessageConfirmed(true);
                    return true;
                }

                return false;
            });
        };

        this.attachMessage = function (message, confirmed) {
            this.messageBlocks.push(new MessageBlock(message.text, confirmed));
        };

        this.isMessageLocal = ko.computed(function () {
            return user.name === currentUser.name;
        });
    };

    var LoginViewModel = function (onAuthSuccess) {
        var self = this;

        this.name = ko.observable("");
        this.password = ko.observable("");
        this.error = ko.observable("");
        this.authenticating = ko.observable("0");

        this.login = function () {
            self.setAuthenticating(true);

            $.ajax({
                    type: "POST",
                    url: '/api/v1/user/auth',
                    data: {
                        name: this.name(),
                        password: this.password()
                    },
                    dataType: 'json'
                })
                .done(function(currentUser) {
                    console.log('Login Success', currentUser);

                    onAuthSuccess(currentUser);
                })
                .fail(function(data) {
                    var error = data.responseJSON.error;

                    console.log('error', error);

                    self.error(error.message);
                })
                .always(function (data) {
                    self.setAuthenticating(false);
                });
        };

        this.setAuthenticating = function (bool) {
            console.log('Authenticating', bool);
            self.authenticating(bool ? "1" : "0");
        };

        this.isAuthenticating = ko.computed(function () {
            return self.authenticating() === "1";
        });
    };

    $(function () {
        $(".ui .list-friends").niceScroll({
            autohidemode: false,
            smoothscroll: false,
            cursorcolor: "#696c75",
            cursorwidth: "8px",
            cursorborder: "none"
        });
        $(".ui .messages").niceScroll({
            autohidemode: false,
            smoothscroll: false,
            cursorcolor: "#cdd2d6",
            cursorwidth: "8px",
            cursorborder: "none"
        });

        $(".ui .new-message-area").keypress(function (e) {
            if (e.keyCode === 13 && !e.shiftKey) {
                $('#new-message-form').submit();
                e.preventDefault();
            }
        });


        var uri = URI();
        var app = new App();

        if (!uri.hasQuery('skipAuth')) {
            app.initAuth();
        } else {
            app.init({
                id: 3,
                name: 'Chad',
                api_token: 'yXwSG6DbNCzPhQ=='
            });
        }
    });

}).call(this);
//# sourceMappingURL=bundle.js.map
